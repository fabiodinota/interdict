//! Bidirectional byte stream relay with optional content inspection.
//!
//! Provides zero-copy `bidirectional` relay using `tokio::io::copy_bidirectional`
//! and an `inspecting_relay_outbound` that passes bytes through `ContentInspector`
//! before forwarding (for outbound prompt inspection in CONNECT tunnels).
//!
//! KERN-13: No channels used. Pure async I/O.

use crate::policy::content_inspection::{ContentInspector, InspectionResult};
use crate::policy::verdict::VerdictAction;
use bytes::BytesMut;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// Relay bytes bidirectionally between two async streams.
///
/// Uses `tokio::io::copy_bidirectional` for zero-copy relay. Returns the
/// number of bytes transferred in each direction: `(client_to_upstream, upstream_to_client)`.
///
/// # Error Propagation
///
/// If either side disconnects during relay, the other side sees EOF.
/// For SSE streams, the client SDK detects the connection drop and can retry.
/// Protocol-specific error injection (SSE error events, gRPC UNAVAILABLE status)
/// is deferred to Phase 3.
pub async fn bidirectional<C, U>(
    mut client: C,
    mut upstream: U,
) -> Result<(u64, u64), std::io::Error>
where
    C: AsyncRead + AsyncWrite + Unpin,
    U: AsyncRead + AsyncWrite + Unpin,
{
    let result = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;

    match &result {
        Ok((client_to_upstream, upstream_to_client)) => {
            tracing::debug!(
                client_to_upstream = client_to_upstream,
                upstream_to_client = upstream_to_client,
                "relay completed"
            );
        }
        Err(e) => {
            tracing::debug!(error = %e, "relay error");
        }
    }

    result
}

/// Safety overlap window size in bytes. Patterns spanning chunk boundaries
/// will be caught as long as they fit within this window. 256 bytes covers
/// all standard PII patterns (SSNs, emails, API keys, credit cards).
const OVERLAP_WINDOW: usize = 256;

/// How long to wait for more data before flushing the accumulator.
/// In CONNECT tunnels the client keeps the connection open bidirectionally,
/// so we cannot wait for EOF to flush small requests. 50ms balances
/// cross-chunk detection accuracy with proxy latency.
const FLUSH_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(50);

/// Relay bytes from `reader` to `writer` with cross-chunk content inspection.
///
/// Accumulates read chunks in a buffer and inspects content with an overlap
/// window so that patterns split across TCP reads (e.g., `AKIA|IOSFODNN7EXAMPLE`)
/// are still detected. Uses a short read timeout to flush accumulated data
/// in bidirectional tunnels where EOF may not arrive until session end.
///
/// Returns bytes forwarded, or Err with reason on block/io-error.
pub async fn inspecting_relay_outbound<R, W>(
    mut reader: R,
    mut writer: W,
    inspector: Arc<ContentInspector>,
) -> Result<u64, String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut read_buf = BytesMut::with_capacity(8192);
    let mut accum = Vec::new();
    let mut total_forwarded: u64 = 0;

    loop {
        read_buf.clear();
        read_buf.resize(8192, 0);

        // Read with a short timeout so we flush accumulated data promptly
        // in bidirectional tunnels (CONNECT) where EOF may never arrive.
        let read_result = tokio::time::timeout(FLUSH_TIMEOUT, reader.read(&mut read_buf)).await;

        match read_result {
            Ok(Ok(0)) => {
                // EOF — inspect and flush remaining accumulated content
                if !accum.is_empty() {
                    total_forwarded += inspect_and_forward(&accum, &inspector, &mut writer).await?;
                }
                break;
            }
            Ok(Ok(n)) => {
                accum.extend_from_slice(&read_buf[..n]);

                // When we have enough accumulated data, inspect the safe prefix
                // (everything except the overlap window) and forward it.
                if accum.len() > OVERLAP_WINDOW {
                    let safe_end = accum.len() - OVERLAP_WINDOW;
                    let safe_prefix = &accum[..safe_end];

                    total_forwarded +=
                        inspect_and_forward(safe_prefix, &inspector, &mut writer).await?;

                    // Keep only the overlap window for the next iteration
                    accum.drain(..safe_end);
                }
            }
            Ok(Err(e)) => {
                return Err(format!("read error: {}", e));
            }
            Err(_) => {
                // Read timeout — no more data arriving soon, flush what we have.
                // This handles bidirectional tunnels where the client waits for
                // a response after sending its request.
                if !accum.is_empty() {
                    total_forwarded += inspect_and_forward(&accum, &inspector, &mut writer).await?;
                    accum.clear();
                    writer
                        .flush()
                        .await
                        .map_err(|e| format!("flush error: {}", e))?;
                }
            }
        }
    }

    writer
        .flush()
        .await
        .map_err(|e| format!("flush error: {}", e))?;

    Ok(total_forwarded)
}

/// Inspect a byte slice and write it through. Returns bytes forwarded.
async fn inspect_and_forward<W>(
    content: &[u8],
    inspector: &ContentInspector,
    writer: &mut W,
) -> Result<u64, String>
where
    W: AsyncWrite + Unpin,
{
    let result: InspectionResult = inspector.inspect_request(content);

    match result.action {
        VerdictAction::Block => {
            tracing::warn!(
                detections = ?result.detections,
                "outbound content blocked by inspector"
            );
            Err(format!("blocked: {}", result.reason))
        }
        VerdictAction::Redact => {
            let to_write = result.redacted_content.as_deref().unwrap_or(content);
            writer
                .write_all(to_write)
                .await
                .map_err(|e| format!("write error: {}", e))?;
            tracing::debug!(
                categories = ?result.detections,
                "outbound content redacted"
            );
            Ok(to_write.len() as u64)
        }
        VerdictAction::Allow => {
            writer
                .write_all(content)
                .await
                .map_err(|e| format!("write error: {}", e))?;
            Ok(content.len() as u64)
        }
    }
}

/// Relay bytes from `reader` to `writer` with content inspection (inbound/response direction).
///
/// Same as `inspecting_relay_outbound` but for the response path (upstream -> client).
/// Redacts detected PII in responses before forwarding to the client.
pub async fn inspecting_relay_inbound<R, W>(
    mut reader: R,
    mut writer: W,
    inspector: Arc<ContentInspector>,
) -> Result<u64, String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buf = BytesMut::with_capacity(8192);
    let mut total_forwarded: u64 = 0;

    loop {
        buf.clear();
        buf.resize(8192, 0);

        let n = reader
            .read(&mut buf)
            .await
            .map_err(|e| format!("read error: {}", e))?;

        if n == 0 {
            break;
        }

        let chunk = &buf[..n];
        let result: InspectionResult = inspector.inspect_response(chunk);

        match result.action {
            VerdictAction::Block => {
                tracing::warn!(
                    detections = ?result.detections,
                    "inbound content blocked by inspector"
                );
                return Err(format!("blocked: {}", result.reason));
            }
            VerdictAction::Redact => {
                let to_write = result.redacted_content.as_deref().unwrap_or(chunk);
                writer
                    .write_all(to_write)
                    .await
                    .map_err(|e| format!("write error: {}", e))?;
                total_forwarded += to_write.len() as u64;
                tracing::debug!(
                    categories = ?result.detections,
                    "inbound content redacted"
                );
            }
            VerdictAction::Allow => {
                writer
                    .write_all(chunk)
                    .await
                    .map_err(|e| format!("write error: {}", e))?;
                total_forwarded += n as u64;
            }
        }
    }

    writer
        .flush()
        .await
        .map_err(|e| format!("flush error: {}", e))?;

    Ok(total_forwarded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn test_bidirectional_relay() {
        // Create two pairs of duplex streams to simulate client and upstream
        let (client_stream, proxy_client_side) = duplex(1024);
        let (proxy_upstream_side, upstream_stream) = duplex(1024);

        // Write data from the "client" end and "upstream" end simultaneously
        let relay_handle =
            tokio::spawn(
                async move { bidirectional(proxy_client_side, proxy_upstream_side).await },
            );

        // Write from client side to upstream side
        tokio::io::AsyncWriteExt::write_all(
            &mut tokio::io::BufWriter::new(&mut tokio::io::split(client_stream).1),
            b"hello upstream",
        )
        .await
        .ok();

        // The duplex API is tricky for full bidirectional tests.
        // Drop handles to trigger EOF and let relay finish.
        drop(upstream_stream);

        // Relay should complete when both sides close.
        let _ = tokio::time::timeout(std::time::Duration::from_millis(100), relay_handle).await;
    }

    #[tokio::test]
    async fn test_bidirectional_relay_eof_propagation() {
        // When one side drops, the other should see EOF.
        let (client, mut proxy_client) = duplex(1024);
        let (mut proxy_upstream, upstream) = duplex(1024);

        // Drop client immediately -- upstream should see EOF
        drop(client);
        drop(upstream);

        let result = bidirectional(&mut proxy_client, &mut proxy_upstream).await;
        assert!(result.is_ok());
        let (c2u, u2c) = result.unwrap();
        assert_eq!(c2u, 0);
        assert_eq!(u2c, 0);
    }

    #[tokio::test]
    async fn test_inspecting_relay_outbound_allow() {
        use crate::policy::config::{
            BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection,
        };
        use crate::policy::patterns::PatternRegistry;
        use crate::policy::redaction::RedactionEngine;

        let registry = Arc::new(PatternRegistry {
            patterns: vec![],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(PolicyConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            rego_source: None,
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Opaque,
            redaction_direction: RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        });
        let inspector = Arc::new(
            ContentInspector::new(registry, redactor, config)
                .expect("content inspector should initialize"),
        );

        let input_data = b"Hello world, this is safe content";
        let (mut reader, mut writer) = duplex(1024);
        tokio::io::AsyncWriteExt::write_all(&mut writer, input_data)
            .await
            .unwrap();
        drop(writer); // Close write side to signal EOF

        // Use a Vec as output for verification
        let mut output = Vec::new();
        let bytes = inspecting_relay_outbound(&mut reader, &mut output, inspector)
            .await
            .unwrap();

        assert_eq!(bytes, input_data.len() as u64);
        assert_eq!(&output, input_data);
    }

    #[tokio::test]
    async fn test_inspecting_relay_outbound_block() {
        use crate::policy::config::{
            BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection,
        };
        use crate::policy::patterns::{PatternRegistry, PatternRule};
        use crate::policy::redaction::RedactionEngine;

        let registry = Arc::new(PatternRegistry {
            patterns: vec![PatternRule {
                category: "AWS_KEY".to_string(),
                pattern: regex::Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
                validator: None,
                base_confidence: 1.0,
                context_boosters: vec![],
            }],
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(PolicyConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            rego_source: None,
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Opaque,
            redaction_direction: RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        });
        let inspector = Arc::new(
            ContentInspector::new(registry, redactor, config)
                .expect("content inspector should initialize"),
        );

        let input_data = b"Key: AKIAIOSFODNN7EXAMPLE";
        let (mut reader, mut writer) = duplex(1024);
        tokio::io::AsyncWriteExt::write_all(&mut writer, input_data)
            .await
            .unwrap();
        drop(writer);

        let mut output = Vec::new();
        let result = inspecting_relay_outbound(&mut reader, &mut output, inspector).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("blocked"));
        // No data should have been forwarded
        assert!(output.is_empty());
    }

    /// Helper to build a blocking inspector with a given pattern.
    fn make_inspector_with_patterns(
        patterns: Vec<crate::policy::patterns::PatternRule>,
    ) -> Arc<ContentInspector> {
        use crate::policy::config::{
            BlockResponseDetail, FailMode, PolicyConfig, RedactionDirection,
        };
        use crate::policy::patterns::PatternRegistry;
        use crate::policy::redaction::RedactionEngine;

        let registry = Arc::new(PatternRegistry {
            patterns,
            version: 1,
        });
        let redactor = Arc::new(RedactionEngine::empty());
        let config = Arc::new(PolicyConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            rego_source: None,
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Opaque,
            redaction_direction: RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        });
        Arc::new(
            ContentInspector::new(registry, redactor, config)
                .expect("content inspector should initialize"),
        )
    }

    #[tokio::test]
    async fn test_cross_chunk_aws_key_detection() {
        use crate::policy::patterns::PatternRule;

        let inspector = make_inspector_with_patterns(vec![PatternRule {
            category: "AWS_KEY".to_string(),
            pattern: regex::Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
            validator: None,
            base_confidence: 1.0,
            context_boosters: vec![],
        }]);

        // Split AWS key AKIAIOSFODNN7EXAMPLE across two writes
        let part1 = b"Prefix text AKIA";
        let part2 = b"IOSFODNN7EXAMPLE suffix";

        let (reader, mut write_end) = duplex(4096);
        tokio::io::AsyncWriteExt::write_all(&mut write_end, part1)
            .await
            .unwrap();
        tokio::io::AsyncWriteExt::write_all(&mut write_end, part2)
            .await
            .unwrap();
        drop(write_end);

        let mut output = Vec::new();
        let result = inspecting_relay_outbound(reader, &mut output, inspector).await;

        assert!(result.is_err(), "cross-chunk AWS key should be blocked");
        assert!(result.unwrap_err().contains("blocked"));
    }

    #[tokio::test]
    async fn test_cross_chunk_ssn_detection() {
        use crate::policy::patterns::PatternRule;

        let inspector = make_inspector_with_patterns(vec![PatternRule {
            category: "SSN".to_string(),
            pattern: regex::Regex::new(r"\d{3}-\d{2}-\d{4}").unwrap(),
            validator: None,
            base_confidence: 0.9,
            context_boosters: vec![],
        }]);

        // Split SSN 123-45-6789 across two writes
        let part1 = b"SSN is 123-45";
        let part2 = b"-6789 end";

        let (reader, mut write_end) = duplex(4096);
        tokio::io::AsyncWriteExt::write_all(&mut write_end, part1)
            .await
            .unwrap();
        tokio::io::AsyncWriteExt::write_all(&mut write_end, part2)
            .await
            .unwrap();
        drop(write_end);

        let mut output = Vec::new();
        let result = inspecting_relay_outbound(reader, &mut output, inspector).await;

        // SSN triggers Redact (not Block), so result should be Ok
        assert!(
            result.is_ok(),
            "cross-chunk SSN should be detected and redacted, got: {:?}",
            result.err()
        );
        // Output should contain redaction markers (asterisks from RedactionEngine)
        let output_str = String::from_utf8_lossy(&output);
        assert!(
            !output_str.contains("123-45-6789"),
            "SSN should be redacted in output"
        );
    }

    #[tokio::test]
    async fn test_clean_content_large_passthrough() {
        let inspector = make_inspector_with_patterns(vec![]);

        // Clean content larger than 8KB — should pass through entirely
        let data = "Hello world! This is safe content. ".repeat(500);
        let data_bytes = data.as_bytes();

        let (reader, mut write_end) = duplex(65536);
        tokio::io::AsyncWriteExt::write_all(&mut write_end, data_bytes)
            .await
            .unwrap();
        drop(write_end);

        let mut output = Vec::new();
        let bytes = inspecting_relay_outbound(reader, &mut output, inspector)
            .await
            .unwrap();

        assert_eq!(bytes, data_bytes.len() as u64);
        assert_eq!(output, data_bytes);
    }
}
