use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::storage::clickhouse::WriterHealth;

/// Prometheus-style counters for evidence-collector pipeline health.
///
/// Reads `WriterHealth` atomics directly (single source of truth for write
/// pipeline stats) and adds operational counters for gRPC-level events.
/// All counters use `Relaxed` ordering — they are monotonic statistics
/// intended for periodic scraping, not synchronization primitives.
pub struct CollectorMetrics {
    writer_health: Arc<WriterHealth>,
    pub bundles_received: AtomicU64,
    pub merkle_anchors_written: AtomicU64,
    pub signing_operations: AtomicU64,
}

impl CollectorMetrics {
    pub fn new(writer_health: Arc<WriterHealth>) -> Self {
        Self {
            writer_health,
            bundles_received: AtomicU64::new(0),
            merkle_anchors_written: AtomicU64::new(0),
            signing_operations: AtomicU64::new(0),
        }
    }

    /// Renders all counters in Prometheus text exposition format (0.0.4).
    ///
    /// Each metric gets a `# HELP` descriptor and `# TYPE counter` annotation
    /// followed by the metric line. Output is directly scrapable by Prometheus.
    pub fn render_prometheus(&self) -> String {
        let bundles_received = self.bundles_received.load(Relaxed);
        let written = self.writer_health.rows_written.load(Relaxed);
        let retried = self.writer_health.rows_retried.load(Relaxed);
        let dead_lettered = self.writer_health.rows_dead_lettered.load(Relaxed);
        let merkle_anchors = self.merkle_anchors_written.load(Relaxed);
        let signing_ops = self.signing_operations.load(Relaxed);

        format!(
            "\
# HELP evidence_bundles_received_total Total evidence bundles received via gRPC
# TYPE evidence_bundles_received_total counter
evidence_bundles_received_total {bundles_received}
# HELP evidence_bundles_written_total Total evidence bundles written to ClickHouse
# TYPE evidence_bundles_written_total counter
evidence_bundles_written_total {written}
# HELP evidence_bundles_retried_total Total ClickHouse write retries
# TYPE evidence_bundles_retried_total counter
evidence_bundles_retried_total {retried}
# HELP evidence_bundles_dead_lettered_total Total bundles dead-lettered after retry exhaustion
# TYPE evidence_bundles_dead_lettered_total counter
evidence_bundles_dead_lettered_total {dead_lettered}
# HELP evidence_merkle_anchors_written_total Total Merkle anchors finalized
# TYPE evidence_merkle_anchors_written_total counter
evidence_merkle_anchors_written_total {merkle_anchors}
# HELP evidence_signing_operations_total Total signing operations performed
# TYPE evidence_signing_operations_total counter
evidence_signing_operations_total {signing_ops}
"
        )
    }
}

/// Starts a minimal HTTP server on `port` that serves Prometheus metrics.
///
/// Responds to `GET /metrics` with text/plain Prometheus exposition format.
/// All other paths receive 404. Connection errors are logged and do not
/// crash the server.
pub async fn serve_metrics(metrics: Arc<CollectorMetrics>, port: u16) -> Result<()> {
    let listener = TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!(port = port, "metrics HTTP server listening");

    loop {
        let (mut stream, peer) = match listener.accept().await {
            Ok(conn) => conn,
            Err(error) => {
                tracing::warn!(error = %error, "metrics listener accept error");
                continue;
            }
        };

        let metrics = Arc::clone(&metrics);
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let n = match stream.read(&mut buf).await {
                Ok(n) => n,
                Err(error) => {
                    tracing::debug!(
                        peer = %peer,
                        error = %error,
                        "metrics connection read error"
                    );
                    return;
                }
            };

            let request_line = String::from_utf8_lossy(&buf[..n]);
            let response = if request_line.starts_with("GET /metrics") {
                let body = metrics.render_prometheus();
                format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: text/plain; version=0.0.4; charset=utf-8\r\n\
                     Content-Length: {}\r\n\
                     \r\n\
                     {}",
                    body.len(),
                    body
                )
            } else {
                "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_string()
            };

            if let Err(error) = stream.write_all(response.as_bytes()).await {
                tracing::debug!(
                    peer = %peer,
                    error = %error,
                    "metrics connection write error"
                );
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::clickhouse::WriterHealth;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    fn make_metrics() -> Arc<CollectorMetrics> {
        let health = Arc::new(WriterHealth::new());
        Arc::new(CollectorMetrics::new(health))
    }

    #[test]
    fn test_render_prometheus_format() {
        let health = Arc::new(WriterHealth::new());
        health.increment_written(42);
        health.increment_retried(3);
        health.increment_dead_lettered(1);

        let metrics = CollectorMetrics::new(health);
        metrics.bundles_received.store(100, Relaxed);
        metrics.merkle_anchors_written.store(7, Relaxed);
        metrics.signing_operations.store(95, Relaxed);

        let output = metrics.render_prometheus();

        // Verify TYPE annotations
        assert!(output.contains("# TYPE evidence_bundles_received_total counter"));
        assert!(output.contains("# TYPE evidence_bundles_written_total counter"));
        assert!(output.contains("# TYPE evidence_bundles_retried_total counter"));
        assert!(output.contains("# TYPE evidence_bundles_dead_lettered_total counter"));
        assert!(output.contains("# TYPE evidence_merkle_anchors_written_total counter"));
        assert!(output.contains("# TYPE evidence_signing_operations_total counter"));

        // Verify HELP lines
        assert!(output.contains("# HELP evidence_bundles_received_total"));
        assert!(output.contains("# HELP evidence_bundles_written_total"));

        // Verify counter values
        assert!(output.contains("evidence_bundles_received_total 100"));
        assert!(output.contains("evidence_bundles_written_total 42"));
        assert!(output.contains("evidence_bundles_retried_total 3"));
        assert!(output.contains("evidence_bundles_dead_lettered_total 1"));
        assert!(output.contains("evidence_merkle_anchors_written_total 7"));
        assert!(output.contains("evidence_signing_operations_total 95"));

        // Must end with newline
        assert!(output.ends_with('\n'));
    }

    #[test]
    fn test_render_prometheus_empty() {
        let metrics = make_metrics();
        let output = metrics.render_prometheus();

        // All counters should be 0
        assert!(output.contains("evidence_bundles_received_total 0"));
        assert!(output.contains("evidence_bundles_written_total 0"));
        assert!(output.contains("evidence_bundles_retried_total 0"));
        assert!(output.contains("evidence_bundles_dead_lettered_total 0"));
        assert!(output.contains("evidence_merkle_anchors_written_total 0"));
        assert!(output.contains("evidence_signing_operations_total 0"));

        // Format must still be valid (HELP/TYPE lines present)
        assert!(output.contains("# TYPE evidence_bundles_received_total counter"));
        assert!(output.ends_with('\n'));
    }

    #[tokio::test]
    async fn test_serve_metrics_returns_200() {
        let metrics = make_metrics();
        metrics.bundles_received.store(5, Relaxed);

        // Bind to port 0 to get a random available port
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let server_metrics = Arc::clone(&metrics);
        let _server = tokio::spawn(async move {
            let _ = serve_metrics(server_metrics, port).await;
        });

        // Give the server a moment to bind
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        stream
            .write_all(b"GET /metrics HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .unwrap();

        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        let response_str = String::from_utf8_lossy(&response);

        assert!(
            response_str.starts_with("HTTP/1.1 200"),
            "expected 200, got: {}",
            &response_str[..response_str.len().min(80)]
        );
        assert!(response_str.contains("text/plain"));
        assert!(response_str.contains("evidence_bundles_received_total 5"));
    }

    #[tokio::test]
    async fn test_serve_metrics_404_on_unknown_path() {
        let metrics = make_metrics();

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let server_metrics = Arc::clone(&metrics);
        let _server = tokio::spawn(async move {
            let _ = serve_metrics(server_metrics, port).await;
        });

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        stream
            .write_all(b"GET /unknown HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .unwrap();

        let mut response = Vec::new();
        stream.read_to_end(&mut response).await.unwrap();
        let response_str = String::from_utf8_lossy(&response);

        assert!(
            response_str.starts_with("HTTP/1.1 404"),
            "expected 404, got: {}",
            &response_str[..response_str.len().min(80)]
        );
    }
}
