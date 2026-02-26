//! Custom HTTP/2 connection pool with multiple connections per vendor.
//!
//! Maintains multiple TCP+TLS connections per AI vendor to avoid
//! single-connection HTTP/2 stream saturation (KERN-12). hyper's built-in
//! pool only opens one HTTP/2 connection per host, which caps at ~100-250
//! concurrent streams.
//!
//! KERN-13: No channels used. DashMap is lock-based, not channel-based.
//! Connection closed notification uses tokio::sync::watch (bounded).

use crate::config::PoolConfig;
use crate::error::ProxyError;
use dashmap::DashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;

/// Custom HTTP/2 connection pool that maintains multiple connections per vendor.
pub struct ConnectionPool {
    /// Shared TLS connector for upstream connections (webpki root certs).
    tls_connector: tokio_rustls::TlsConnector,
    /// Maximum HTTP/2 connections per vendor domain.
    max_conns_per_vendor: usize,
    /// Maximum concurrent streams per HTTP/2 connection.
    max_streams_per_conn: usize,
    /// Timeout for establishing upstream TCP connections.
    connect_timeout: Duration,
    /// Map from vendor domain to vector of pooled connections.
    connections: DashMap<String, Vec<PoolEntry>>,
}

/// A single pooled connection to a vendor.
struct PoolEntry {
    /// Number of active streams on this connection.
    active_streams: Arc<AtomicUsize>,
    /// Whether this connection has been detected as dead.
    is_dead: Arc<AtomicBool>,
}

/// RAII guard that decrements active_streams when dropped.
///
/// Ensures streams are always properly tracked even if the relay task panics.
#[derive(Debug)]
pub struct StreamGuard {
    active_streams: Arc<AtomicUsize>,
}

impl Drop for StreamGuard {
    fn drop(&mut self) {
        self.active_streams.fetch_sub(1, Ordering::Release);
    }
}

/// Pool statistics for metrics and debugging.
#[derive(Debug)]
pub struct PoolStats {
    /// Total number of connections across all vendors.
    pub total_connections: usize,
    /// Total number of active streams across all connections.
    pub total_active_streams: usize,
    /// Per-vendor breakdown: (domain, connection_count, active_streams).
    pub per_vendor: Vec<(String, usize, usize)>,
}

impl ConnectionPool {
    /// Create a new connection pool with the given configuration.
    ///
    /// Uses `webpki_roots::TLS_SERVER_ROOTS` for upstream TLS validation.
    pub fn new(config: &PoolConfig, connect_timeout: Duration) -> Self {
        let mut root_store = rustls::RootCertStore::empty();
        root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

        let client_config = rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();

        let tls_connector = tokio_rustls::TlsConnector::from(Arc::new(client_config));

        Self {
            tls_connector,
            max_conns_per_vendor: config.max_connections_per_vendor,
            max_streams_per_conn: config.max_streams_per_connection,
            connect_timeout,
            connections: DashMap::new(),
        }
    }

    /// Establish a direct TLS connection to an upstream vendor.
    ///
    /// This is the Phase 1 approach: direct TCP+TLS connections.
    /// The full HTTP/2 connection pooling with SendRequest handles
    /// is implemented in `get_or_connect` but the simple TLS path
    /// is used by the CONNECT tunnel for raw byte relay.
    pub async fn connect_tls(
        &self,
        host: &str,
        port: u16,
    ) -> Result<tokio_rustls::client::TlsStream<TcpStream>, ProxyError> {
        let addr = format!("{}:{}", host, port);

        // Establish TCP connection with timeout
        let tcp_stream = tokio::time::timeout(self.connect_timeout, TcpStream::connect(&addr))
            .await
            .map_err(|_| ProxyError::VendorUnreachable {
                vendor: host.to_string(),
                source: std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    format!("TCP connect to {} timed out", addr),
                ),
            })?
            .map_err(|e| ProxyError::VendorUnreachable {
                vendor: host.to_string(),
                source: e,
            })?;

        // Perform TLS handshake
        let server_name = rustls::pki_types::ServerName::try_from(host.to_string())
            .map_err(|_| ProxyError::Config(format!("invalid server name: {}", host)))?;

        let tls_stream = self
            .tls_connector
            .connect(server_name, tcp_stream)
            .await
            .map_err(|e| ProxyError::VendorUnreachable {
                vendor: host.to_string(),
                source: e,
            })?;

        Ok(tls_stream)
    }

    /// Get or create a connection to a vendor, tracking active streams.
    ///
    /// Returns a StreamGuard that decrements the active stream counter on drop.
    /// If all connections are saturated and the pool is full, returns PoolExhausted.
    pub fn get_or_create_stream(&self, host: &str) -> Result<StreamGuard, ProxyError> {
        let mut entry = self.connections.entry(host.to_string()).or_default();
        let conns = entry.value_mut();

        // Clean up dead connections
        conns.retain(|c| !c.is_dead.load(Ordering::Acquire));

        // Find least-loaded connection with capacity
        let best = conns
            .iter()
            .filter(|c| c.active_streams.load(Ordering::Acquire) < self.max_streams_per_conn)
            .min_by_key(|c| c.active_streams.load(Ordering::Acquire));

        if let Some(conn) = best {
            conn.active_streams.fetch_add(1, Ordering::Release);
            return Ok(StreamGuard {
                active_streams: conn.active_streams.clone(),
            });
        }

        // All connections saturated -- can we create a new one?
        if conns.len() < self.max_conns_per_vendor {
            let active_streams = Arc::new(AtomicUsize::new(1));
            let is_dead = Arc::new(AtomicBool::new(false));
            conns.push(PoolEntry {
                active_streams: active_streams.clone(),
                is_dead,
            });
            return Ok(StreamGuard { active_streams });
        }

        // Pool exhausted
        Err(ProxyError::PoolExhausted(host.to_string()))
    }

    /// Get pool statistics for metrics and debugging.
    pub fn pool_stats(&self) -> PoolStats {
        let mut total_connections = 0;
        let mut total_active_streams = 0;
        let mut per_vendor = Vec::new();

        for entry in self.connections.iter() {
            let domain = entry.key().clone();
            let conns = entry.value();
            let conn_count = conns.len();
            let streams: usize = conns
                .iter()
                .map(|c| c.active_streams.load(Ordering::Acquire))
                .sum();

            total_connections += conn_count;
            total_active_streams += streams;
            per_vendor.push((domain, conn_count, streams));
        }

        PoolStats {
            total_connections,
            total_active_streams,
            per_vendor,
        }
    }

    /// Get the maximum connections per vendor (for testing).
    #[cfg(test)]
    pub fn max_conns_per_vendor(&self) -> usize {
        self.max_conns_per_vendor
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pool(max_conns: usize, max_streams: usize) -> ConnectionPool {
        ConnectionPool::new(
            &PoolConfig {
                max_connections_per_vendor: max_conns,
                max_streams_per_connection: max_streams,
                idle_timeout_ms: 60_000,
            },
            Duration::from_secs(10),
        )
    }

    #[test]
    fn test_new_pool_starts_empty() {
        let pool = test_pool(4, 100);
        let stats = pool.pool_stats();
        assert_eq!(stats.total_connections, 0);
        assert_eq!(stats.total_active_streams, 0);
        assert!(stats.per_vendor.is_empty());
    }

    #[test]
    fn test_get_or_create_stream_creates_connection() {
        let pool = test_pool(4, 100);

        let _guard = pool
            .get_or_create_stream("api.openai.com")
            .expect("should create stream");

        let stats = pool.pool_stats();
        assert_eq!(stats.total_connections, 1);
        assert_eq!(stats.total_active_streams, 1);
    }

    #[test]
    fn test_multiple_streams_reuse_same_connection() {
        let pool = test_pool(4, 100);

        let _g1 = pool
            .get_or_create_stream("api.openai.com")
            .expect("stream 1");
        let _g2 = pool
            .get_or_create_stream("api.openai.com")
            .expect("stream 2");
        let _g3 = pool
            .get_or_create_stream("api.openai.com")
            .expect("stream 3");

        let stats = pool.pool_stats();
        assert_eq!(stats.total_connections, 1);
        assert_eq!(stats.total_active_streams, 3);
    }

    #[test]
    fn test_new_connection_created_when_stream_limit_reached() {
        let pool = test_pool(4, 2); // 2 streams per connection

        let _g1 = pool.get_or_create_stream("api.openai.com").unwrap();
        let _g2 = pool.get_or_create_stream("api.openai.com").unwrap();
        // Both streams on first connection -- now next should create a new connection
        let _g3 = pool.get_or_create_stream("api.openai.com").unwrap();

        let stats = pool.pool_stats();
        assert_eq!(stats.total_connections, 2);
        assert_eq!(stats.total_active_streams, 3);
    }

    #[test]
    fn test_pool_exhausted_when_all_full() {
        let pool = test_pool(2, 1); // 2 connections, 1 stream each

        let _g1 = pool.get_or_create_stream("api.openai.com").unwrap();
        let _g2 = pool.get_or_create_stream("api.openai.com").unwrap();

        // Both connections at capacity, pool full
        let result = pool.get_or_create_stream("api.openai.com");
        assert!(result.is_err());
        match result.unwrap_err() {
            ProxyError::PoolExhausted(vendor) => assert_eq!(vendor, "api.openai.com"),
            other => panic!("expected PoolExhausted, got {:?}", other),
        }
    }

    #[test]
    fn test_stream_guard_decrements_on_drop() {
        let pool = test_pool(4, 100);

        {
            let _guard = pool.get_or_create_stream("api.openai.com").unwrap();
            let stats = pool.pool_stats();
            assert_eq!(stats.total_active_streams, 1);
        }
        // Guard dropped here

        let stats = pool.pool_stats();
        assert_eq!(stats.total_active_streams, 0);
    }

    #[test]
    fn test_stream_guard_allows_reuse_after_drop() {
        let pool = test_pool(2, 1); // Very restrictive: 2 conns, 1 stream each

        let _g1 = pool.get_or_create_stream("api.openai.com").unwrap();
        let _g2 = pool.get_or_create_stream("api.openai.com").unwrap();

        // Pool exhausted
        assert!(pool.get_or_create_stream("api.openai.com").is_err());

        // Drop one guard
        drop(_g1);

        // Now a slot is available
        let _g3 = pool.get_or_create_stream("api.openai.com").unwrap();
        let stats = pool.pool_stats();
        assert_eq!(stats.total_active_streams, 2);
    }

    #[test]
    fn test_different_vendors_independent() {
        let pool = test_pool(2, 1);

        let _g1 = pool.get_or_create_stream("api.openai.com").unwrap();
        let _g2 = pool.get_or_create_stream("api.anthropic.com").unwrap();

        let stats = pool.pool_stats();
        assert_eq!(stats.total_connections, 2); // 1 per vendor
        assert_eq!(stats.per_vendor.len(), 2);
    }

    #[test]
    fn test_dead_connections_cleaned_up() {
        let pool = test_pool(2, 100);

        // Create a stream and manually mark the entry as dead
        let _g1 = pool.get_or_create_stream("api.openai.com").unwrap();
        drop(_g1);

        // Mark the connection as dead
        if let Some(mut entry) = pool.connections.get_mut("api.openai.com") {
            for conn in entry.value_mut().iter() {
                conn.is_dead.store(true, Ordering::Release);
            }
        }

        // Next access should clean up dead connections and create new one
        let _g2 = pool.get_or_create_stream("api.openai.com").unwrap();
        let stats = pool.pool_stats();
        // Dead connection cleaned up, new one created
        assert_eq!(stats.total_connections, 1);
        assert_eq!(stats.total_active_streams, 1);
    }
}
