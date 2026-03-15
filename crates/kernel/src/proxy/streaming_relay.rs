//! Streaming relay with incremental pattern detection and adaptive buffering.
//!
//! The `InspectingRelay` applies incremental pattern detection to streaming responses,
//! using an adaptive buffer that grows when partial patterns are detected. Severe
//! violations sever the stream mid-response and inject custom policy messages.

use crate::policy::streaming::{AdaptiveTokenBuffer, BufferPreset, ScanResult, StreamingDetector};
use bytes::Bytes;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Relay that inspects streaming content incrementally.
pub struct InspectingRelay {
    detector: Arc<StreamingDetector>,
    buffer_preset: BufferPreset,
}

/// Action to take on the stream.
#[allow(dead_code)]
pub enum StreamAction {
    /// Forward the bytes to output.
    Forward(Bytes),
    /// Sever the stream and inject custom message.
    Sever(String),
}

impl InspectingRelay {
    /// Create a new inspecting relay with detector and buffer preset.
    pub fn new(detector: Arc<StreamingDetector>, buffer_preset: BufferPreset) -> Self {
        Self {
            detector,
            buffer_preset,
        }
    }

    /// Relay with incremental inspection.
    ///
    /// Reads chunks from input, buffers them adaptively, scans for patterns,
    /// and forwards to output. If severe categories are detected, severs the
    /// stream and injects a custom policy message.
    ///
    /// # Arguments
    /// * `input` - Stream of incoming chunks
    /// * `output` - Channel to send processed chunks
    /// * `sever_categories` - Categories that trigger stream severing
    /// * `sever_message` - Custom message to inject when severing
    pub async fn relay_with_inspection(
        &self,
        mut input: mpsc::Receiver<Bytes>,
        output: mpsc::Sender<Bytes>,
        sever_categories: Vec<String>,
        sever_message: String,
    ) -> Result<(), String> {
        let mut buffer = AdaptiveTokenBuffer::new(self.buffer_preset);

        while let Some(chunk) = input.recv().await {
            buffer.push(chunk);

            // Scan buffered content
            let content = buffer.buffer_as_string();
            let scan_result = self.detector.scan(&content);

            match scan_result {
                ScanResult::NoMatch => {
                    buffer.set_partial_match(false);

                    // Emit oldest chunk if buffer exceeds base size
                    if let Some(oldest) = buffer.emit_oldest() {
                        output
                            .send(oldest)
                            .await
                            .map_err(|e| format!("send failed: {}", e))?;
                    }
                }
                ScanResult::PartialMatch => {
                    buffer.set_partial_match(true);
                    // Hold buffer, don't emit yet
                }
                ScanResult::FullMatch(detections) => {
                    buffer.set_partial_match(false);

                    // Check if any severe categories detected
                    let has_severe = detections
                        .iter()
                        .any(|d| sever_categories.contains(&d.category));

                    if has_severe {
                        // Sever stream (user decision from CONTEXT.md)
                        let injection = Bytes::from(format!("\n\n{}\n", sever_message));
                        output
                            .send(injection)
                            .await
                            .map_err(|e| format!("send failed: {}", e))?;

                        return Err(format!(
                            "stream severed: severe violation detected ({})",
                            detections
                                .iter()
                                .filter(|d| sever_categories.contains(&d.category))
                                .map(|d| d.category.as_str())
                                .collect::<Vec<_>>()
                                .join(", ")
                        ));
                    } else {
                        // Apply redaction
                        let redacted = self.detector.apply_redaction(&content, detections);
                        buffer.clear();

                        output
                            .send(Bytes::from(redacted))
                            .await
                            .map_err(|e| format!("send failed: {}", e))?;
                    }
                }
            }
        }

        // Flush remaining buffer on stream end (Pitfall 4 mitigation)
        for chunk in buffer.flush_all() {
            output
                .send(chunk)
                .await
                .map_err(|e| format!("send failed: {}", e))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::patterns::{PatternRegistry, PatternRule};
    use crate::policy::redaction::RedactionEngine;
    use regex::Regex;

    #[tokio::test]
    async fn test_relay_passes_clean_content() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        input_tx.send(Bytes::from("Hello ")).await.unwrap();
        input_tx.send(Bytes::from("world")).await.unwrap();
        drop(input_tx);

        tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
                .unwrap();
        });

        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.push(chunk);
        }

        let result: String = collected
            .iter()
            .flat_map(|b| b.iter())
            .map(|&b| b as char)
            .collect();

        assert!(result.contains("Hello"));
        assert!(result.contains("world"));
    }

    #[tokio::test]
    async fn test_relay_redacts_pii() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        input_tx.send(Bytes::from("Contact ")).await.unwrap();
        input_tx
            .send(Bytes::from("user@example.com "))
            .await
            .unwrap();
        input_tx.send(Bytes::from("today")).await.unwrap();
        drop(input_tx);

        tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
                .unwrap();
        });

        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.push(chunk);
        }

        let result: String = collected
            .iter()
            .flat_map(|b| b.iter())
            .map(|&b| b as char)
            .collect();

        // The empty redaction engine replaces matches with asterisks of equal length.
        // Verify the email was redacted (replaced with asterisks or tagged placeholder).
        assert!(
            !result.contains("user@example.com"),
            "email should be redacted, but found in output: {result}"
        );
    }

    #[tokio::test]
    async fn test_relay_severs_on_severe_violation() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "AWS_KEY".to_string(),
                pattern: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                validator: None,
                base_confidence: 1.0,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        input_tx.send(Bytes::from("Key: ")).await.unwrap();
        input_tx
            .send(Bytes::from("AKIAIOSFODNN7EXAMPLE"))
            .await
            .unwrap();
        drop(input_tx);

        let sever_categories = vec!["AWS_KEY".to_string()];
        let sever_message = "[REDACTED BY INTERDICT POLICY: SECRET_DETECTION]".to_string();

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, sever_categories, sever_message.clone())
                .await
        });

        // Wait for relay to finish
        let result = handle.await.unwrap();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("stream severed"));

        // Collect all output — may include passthrough chunks before sever message
        let mut all_output = String::new();
        while let Ok(Some(msg)) =
            tokio::time::timeout(std::time::Duration::from_millis(100), output_rx.recv()).await
        {
            all_output.push_str(&String::from_utf8_lossy(&msg));
        }

        // Sever message must appear in output before stream was severed
        assert!(
            all_output.contains("REDACTED BY INTERDICT POLICY"),
            "sever message not found in output: {}",
            all_output
        );
    }

    #[tokio::test]
    async fn test_relay_handles_empty_stream() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        // Drop input immediately -- empty stream
        drop(input_tx);

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
        });

        let result = handle.await.unwrap();
        assert!(
            result.is_ok(),
            "empty stream should succeed: {:?}",
            result.err()
        );

        // Output should be empty
        let chunk =
            tokio::time::timeout(std::time::Duration::from_millis(100), output_rx.recv()).await;
        match chunk {
            Ok(None) | Err(_) => { /* expected: no output */ }
            Ok(Some(data)) => {
                assert!(
                    data.is_empty(),
                    "expected no output from empty stream, got: {:?}",
                    data
                );
            }
        }
    }

    #[tokio::test]
    async fn test_relay_partial_match_hold_and_release() {
        // Chunk 1 ends with partial email ("user@exam" has @ but no TLD) → PartialMatch → hold
        // Chunk 2 completes it ("ple.com for info") → FullMatch → redact and emit
        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "EMAIL".to_string(),
                pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                validator: None,
                base_confidence: 0.9,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        // Partial email: has @ but no ".TLD" → triggers PartialMatch
        input_tx
            .send(Bytes::from("Contact user@exam"))
            .await
            .unwrap();
        // Completes the email → combined buffer becomes "Contact user@example.com for info"
        input_tx
            .send(Bytes::from("ple.com for info"))
            .await
            .unwrap();
        drop(input_tx);

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
        });

        let result = handle.await.unwrap();
        assert!(
            result.is_ok(),
            "partial-match relay should succeed: {:?}",
            result.err()
        );

        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.push(chunk);
        }

        let output: String = collected
            .iter()
            .flat_map(|b| b.iter())
            .map(|&b| b as char)
            .collect();

        // Email should be redacted after partial match resolved to full match
        assert!(
            !output.contains("user@example.com"),
            "email should be redacted after partial match resolved: {output}"
        );
        // Surrounding text must be preserved
        assert!(
            output.contains("Contact"),
            "non-PII text should be preserved: {output}"
        );
        assert!(
            output.contains("for info"),
            "non-PII text should be preserved: {output}"
        );
    }

    #[tokio::test]
    async fn test_relay_multiple_redactions_across_chunks() {
        // Chunk 1 has an email → FullMatch → redact
        // Chunk 2 has an SSN → FullMatch → redact independently
        // Verifies sequential redactions work across buffer clears
        let registry = Arc::new(PatternRegistry {
            patterns: vec![
                PatternRule {
                    category: "EMAIL".to_string(),
                    pattern: Regex::new(r"[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}").unwrap(),
                    validator: None,
                    base_confidence: 0.9,
                    context_boosters: vec![],
                },
                PatternRule {
                    category: "SSN".to_string(),
                    pattern: Regex::new(r"\d{3}-\d{2}-\d{4}").unwrap(),
                    validator: None,
                    base_confidence: 0.9,
                    context_boosters: vec![],
                },
            ],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        // Each chunk triggers an independent FullMatch after buffer clear
        input_tx
            .send(Bytes::from("Email: user@example.com end."))
            .await
            .unwrap();
        input_tx
            .send(Bytes::from("SSN: 123-45-6789 end."))
            .await
            .unwrap();
        input_tx.send(Bytes::from("Done.")).await.unwrap();
        drop(input_tx);

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
        });

        let result = handle.await.unwrap();
        assert!(
            result.is_ok(),
            "multi-redaction relay should succeed: {:?}",
            result.err()
        );

        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.push(chunk);
        }

        let output: String = collected
            .iter()
            .flat_map(|b| b.iter())
            .map(|&b| b as char)
            .collect();

        // Both PII values should be independently redacted
        assert!(
            !output.contains("user@example.com"),
            "email should be redacted: {output}"
        );
        assert!(
            !output.contains("123-45-6789"),
            "SSN should be redacted: {output}"
        );
        // Labels should survive redaction
        assert!(
            output.contains("Email:"),
            "email label should be preserved: {output}"
        );
        assert!(
            output.contains("SSN:"),
            "SSN label should be preserved: {output}"
        );
    }

    #[tokio::test]
    async fn test_relay_handles_sender_drop_gracefully() {
        // Send one chunk, then immediately drop the sender channel.
        // Relay must complete without panic and emit processed data.
        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        input_tx.send(Bytes::from("partial data")).await.unwrap();
        drop(input_tx); // Abrupt channel closure

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
        });

        let result = handle.await.unwrap();
        assert!(
            result.is_ok(),
            "relay should handle sender drop gracefully: {:?}",
            result.err()
        );

        // Successfully processed data should still be emitted
        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.push(chunk);
        }

        let output: String = collected
            .iter()
            .flat_map(|b| b.iter())
            .map(|&b| b as char)
            .collect();

        assert!(
            output.contains("partial data"),
            "processed data should be emitted despite abrupt sender drop: {output}"
        );
    }

    #[tokio::test]
    async fn test_relay_flushes_buffer_on_end() {
        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let detector = Arc::new(StreamingDetector::new(registry, redactor));

        let relay = InspectingRelay::new(detector, BufferPreset::Small);

        let (input_tx, input_rx) = mpsc::channel(10);
        let (output_tx, mut output_rx) = mpsc::channel(10);

        // Send small chunks that individually are below the buffer threshold
        input_tx.send(Bytes::from("ab")).await.unwrap();
        input_tx.send(Bytes::from("cd")).await.unwrap();
        input_tx.send(Bytes::from("ef")).await.unwrap();
        drop(input_tx); // signal end of stream

        let handle = tokio::spawn(async move {
            relay
                .relay_with_inspection(input_rx, output_tx, vec![], String::new())
                .await
        });

        let result = handle.await.unwrap();
        assert!(
            result.is_ok(),
            "flush test should succeed: {:?}",
            result.err()
        );

        // Collect all output and verify all content was flushed
        let mut collected = Vec::new();
        while let Some(chunk) = output_rx.recv().await {
            collected.extend_from_slice(&chunk);
        }

        let output_str = String::from_utf8_lossy(&collected);
        assert!(
            output_str.contains("ab"),
            "output should contain 'ab': {output_str}"
        );
        assert!(
            output_str.contains("cd"),
            "output should contain 'cd': {output_str}"
        );
        assert!(
            output_str.contains("ef"),
            "output should contain 'ef': {output_str}"
        );
    }
}
