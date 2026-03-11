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
}
