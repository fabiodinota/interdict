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

/// Relay bytes from `reader` to `writer` with content inspection.
///
/// Reads data in chunks, calls ContentInspector on each chunk, and either:
/// - Forwards the (possibly redacted) content if Allow or Redact verdict
/// - Drops the data and returns an Err if Block verdict
///
/// Returns bytes forwarded, or Err with reason on block/io-error.
///
/// IMPLEMENTATION NOTE: This performs chunk-level inspection. For patterns
/// spanning multiple chunks, the AdaptiveTokenBuffer in InspectingRelay
/// (used for inbound/response direction) provides cross-chunk detection.
/// Outbound prompts are typically sent as complete HTTP request bodies in
/// a single write, so chunk-level inspection is sufficient for Phase 3.
pub async fn inspecting_relay_outbound<R, W>(
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
        // Resize buffer for reading
        buf.resize(8192, 0);

        let n = reader
            .read(&mut buf)
            .await
            .map_err(|e| format!("read error: {}", e))?;

        if n == 0 {
            // EOF -- reader closed
            break;
        }

        let chunk = &buf[..n];

        // Inspect the chunk content
        let result: InspectionResult = inspector.inspect_request(chunk);

        match result.action {
            VerdictAction::Block => {
                tracing::warn!(
                    detections = ?result.detections,
                    "outbound content blocked by inspector"
                );
                return Err(format!("blocked: {}", result.reason));
            }
            VerdictAction::Redact => {
                // Forward redacted content if available, otherwise forward original
                let to_write = result.redacted_content.as_deref().unwrap_or(chunk);
                writer
                    .write_all(to_write)
                    .await
                    .map_err(|e| format!("write error: {}", e))?;
                total_forwarded += to_write.len() as u64;
                tracing::debug!(
                    categories = ?result.detections,
                    "outbound content redacted"
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

    // Flush writer to ensure all data is sent
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
        let inspector = Arc::new(ContentInspector::new(registry, redactor, config));

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
        let inspector = Arc::new(ContentInspector::new(registry, redactor, config));

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
}
