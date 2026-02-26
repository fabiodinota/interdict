//! CONNECT tunnel handler with TLS interception.
//!
//! Handles HTTP CONNECT requests by establishing a TLS-intercepted tunnel:
//! 1. Return 200 to complete CONNECT handshake
//! 2. Upgrade connection to get raw TCP stream
//! 3. Terminate TLS from client (client thinks it's talking to vendor)
//! 4. Establish TLS connection to upstream vendor
//! 5. Relay bytes bidirectionally (zero-copy)
//!
//! The allowlist check is handled by AllowlistLayer middleware before
//! this handler is called.
//!
//! KERN-13: Uses tokio::sync::watch for shutdown (bounded). No unbounded channels.

use crate::config::Config;
use crate::error::{ProxyBody, ProxyError};
use crate::proxy::pool::ConnectionPool;
use crate::proxy::relay;
use crate::proxy::tls::CertCache;

use bytes::Bytes;
use http::{Method, Request, Response, StatusCode};
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::net::TcpStream;
use tower::Service;

/// Create an empty boxed body for 200 OK responses.
fn empty_body() -> ProxyBody {
    BoxBody::new(Empty::<Bytes>::new().map_err(|never| match never {}))
}

/// Create a full boxed body from bytes.
fn full_body(data: Vec<u8>) -> ProxyBody {
    BoxBody::new(Full::new(Bytes::from(data)).map_err(|never| match never {}))
}

/// Handle an HTTP CONNECT request with TLS interception.
///
/// Steps:
/// 1. Extract host:port from the CONNECT URI authority
/// 2. Return HTTP 200 to complete the CONNECT handshake
/// 3. Spawn a task to perform the actual tunnel:
///    a. Upgrade the connection to get the raw TCP stream
///    b. Terminate TLS from the client using the cert cache
///    c. Connect to the upstream vendor via the connection pool
///    d. Relay bytes bidirectionally
pub async fn handle_connect(
    req: Request<Incoming>,
    cert_cache: Arc<CertCache>,
    pool: Arc<ConnectionPool>,
    config: Arc<Config>,
) -> Result<Response<ProxyBody>, ProxyError> {
    // 1. Extract host and port from CONNECT authority
    let authority = req
        .uri()
        .authority()
        .ok_or(ProxyError::MissingAuthority)?;

    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(443);

    tracing::info!(
        vendor = %host,
        port = port,
        "CONNECT tunnel requested"
    );

    let connect_timeout = Duration::from_millis(config.proxy.connect_timeout_ms);
    let stream_timeout = Duration::from_millis(config.proxy.stream_timeout_ms);

    // 2. Return 200 to complete the CONNECT handshake.
    // The actual tunnel work happens in the spawned task after the upgrade.
    tokio::spawn(async move {
        // 3a. Upgrade the connection to get the raw TCP stream
        let upgraded = match hyper::upgrade::on(req).await {
            Ok(upgraded) => upgraded,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "upgrade failed"
                );
                return;
            }
        };

        // 3b. Get domain-specific TLS server config for client-side TLS termination
        let server_config = match cert_cache.get_or_create(&host).await {
            Ok(cfg) => cfg,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "failed to get TLS cert for domain"
                );
                return;
            }
        };

        // Create TLS acceptor and terminate client TLS
        let tls_acceptor = tokio_rustls::TlsAcceptor::from(server_config);
        let client_tls = match tls_acceptor.accept(TokioIo::new(upgraded)).await {
            Ok(stream) => stream,
            Err(e) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "TLS handshake with client failed"
                );
                return;
            }
        };

        tracing::debug!(vendor = %host, "client TLS terminated");

        // 3c. Connect to upstream vendor
        let upstream_tls = match tokio::time::timeout(
            connect_timeout,
            connect_upstream(&pool, &host, port),
        )
        .await
        {
            Ok(Ok(stream)) => stream,
            Ok(Err(e)) => {
                tracing::error!(
                    vendor = %host,
                    error = %e,
                    "failed to connect to upstream vendor"
                );
                return;
            }
            Err(_) => {
                tracing::error!(
                    vendor = %host,
                    timeout_ms = config.proxy.connect_timeout_ms,
                    "upstream connect timeout"
                );
                return;
            }
        };

        tracing::debug!(vendor = %host, "upstream TLS established");

        // 3d. Relay bytes bidirectionally with stream timeout
        let relay_result = tokio::time::timeout(
            stream_timeout,
            relay::bidirectional(client_tls, upstream_tls),
        )
        .await;

        match relay_result {
            Ok(Ok((c2u, u2c))) => {
                tracing::info!(
                    vendor = %host,
                    client_to_upstream = c2u,
                    upstream_to_client = u2c,
                    "tunnel closed"
                );
            }
            Ok(Err(e)) => {
                tracing::warn!(
                    vendor = %host,
                    error = %e,
                    "tunnel relay error"
                );
            }
            Err(_) => {
                tracing::warn!(
                    vendor = %host,
                    timeout_ms = config.proxy.stream_timeout_ms,
                    "stream timeout exceeded"
                );
            }
        }
    });

    // Return 200 immediately to complete the CONNECT handshake.
    // The tunnel runs asynchronously in the spawned task.
    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(empty_body())
        .expect("Response builder with valid status should never fail"))
}

/// Establish a TLS connection to the upstream vendor.
///
/// Uses the connection pool's TLS connector for standard certificate
/// validation against webpki root certificates.
async fn connect_upstream(
    pool: &ConnectionPool,
    host: &str,
    port: u16,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>, ProxyError> {
    pool.connect_tls(host, port).await
}

/// Tower Service that dispatches CONNECT requests to the tunnel handler.
///
/// Non-CONNECT requests receive 400 Bad Request -- this is an explicit
/// forward proxy that only supports HTTPS CONNECT (per CONTEXT.md).
#[derive(Clone)]
pub struct ProxyService {
    cert_cache: Arc<CertCache>,
    pool: Arc<ConnectionPool>,
    config: Arc<Config>,
}

impl ProxyService {
    /// Create a new ProxyService with shared state.
    pub fn new(
        cert_cache: Arc<CertCache>,
        pool: Arc<ConnectionPool>,
        config: Arc<Config>,
    ) -> Self {
        Self {
            cert_cache,
            pool,
            config,
        }
    }
}

impl Service<Request<Incoming>> for ProxyService {
    type Response = Response<ProxyBody>;
    type Error = std::convert::Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<Incoming>) -> Self::Future {
        let cert_cache = self.cert_cache.clone();
        let pool = self.pool.clone();
        let config = self.config.clone();

        Box::pin(async move {
            if req.method() == Method::CONNECT {
                match handle_connect(req, cert_cache, pool, config).await {
                    Ok(response) => Ok(response),
                    Err(e) => {
                        tracing::error!(error = %e, "CONNECT handler error");
                        Ok(error_response_for(e))
                    }
                }
            } else {
                // Non-CONNECT requests are not supported.
                // This is an explicit forward proxy: HTTPS CONNECT only.
                tracing::warn!(
                    method = %req.method(),
                    uri = %req.uri(),
                    "non-CONNECT request rejected"
                );
                Ok(Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .header("content-type", "application/json")
                    .body(full_body(
                        serde_json::to_vec(&serde_json::json!({
                            "error": "method_not_supported",
                            "message": "Only CONNECT requests are supported. This is an explicit HTTPS forward proxy."
                        }))
                        .expect("JSON serialization should never fail"),
                    ))
                    .expect("Response builder with valid status should never fail"))
            }
        })
    }
}

/// Map a ProxyError to an appropriate HTTP error response.
fn error_response_for(err: ProxyError) -> Response<ProxyBody> {
    match err {
        ProxyError::MissingAuthority => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("content-type", "application/json")
            .body(full_body(
                serde_json::to_vec(&serde_json::json!({
                    "error": "missing_authority",
                    "message": "CONNECT request must include host:port authority"
                }))
                .expect("JSON serialization should never fail"),
            ))
            .expect("Response builder with valid status should never fail"),
        ProxyError::VendorBlocked(ref vendor) => crate::error::vendor_blocked_response(vendor),
        ProxyError::PoolExhausted(ref vendor) => {
            let body = serde_json::to_vec(&serde_json::json!({
                "error": "pool_exhausted",
                "vendor": vendor,
                "message": "All connections to this vendor are at maximum capacity"
            }))
            .expect("JSON serialization should never fail");
            Response::builder()
                .status(StatusCode::SERVICE_UNAVAILABLE)
                .header("content-type", "application/json")
                .header("retry-after", "1")
                .body(full_body(body))
                .expect("Response builder with valid status should never fail")
        }
        _ => {
            let body = serde_json::to_vec(&serde_json::json!({
                "error": "internal_error",
                "message": err.to_string()
            }))
            .expect("JSON serialization should never fail");
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .header("content-type", "application/json")
                .body(full_body(body))
                .expect("Response builder with valid status should never fail")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test ProxyService via a real hyper client-server connection.
    /// This validates the full Tower service stack works with hyper's Service trait.
    #[tokio::test]
    async fn test_proxy_service_rejects_non_connect() {
        let cert_cache = create_test_cert_cache();
        let pool = Arc::new(ConnectionPool::new(
            &crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            Duration::from_secs(10),
        ));
        let config = Arc::new(test_config());

        let svc = ProxyService::new(cert_cache, pool, config);

        // Set up a real TCP listener/connection pair for hyper
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_handle = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let io = TokioIo::new(stream);
            let hyper_svc =
                hyper_util::service::TowerToHyperService::new(svc);
            hyper_util::server::conn::auto::Builder::new(
                hyper_util::rt::TokioExecutor::new(),
            )
            .serve_connection(io, hyper_svc)
            .await
            .ok();
        });

        // Connect as a client and send a GET request
        let tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
        tokio::spawn(conn);

        let req = Request::builder()
            .method(Method::GET)
            .uri("/v1/chat")
            .header("host", "api.openai.com")
            .body(Empty::<Bytes>::new())
            .unwrap();

        let resp = sender.send_request(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "method_not_supported");

        server_handle.abort();
    }

    /// Test that CONNECT requests return 200 for tunnel establishment.
    #[tokio::test]
    async fn test_proxy_service_accepts_connect() {
        let cert_cache = create_test_cert_cache();
        let pool = Arc::new(ConnectionPool::new(
            &crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            Duration::from_secs(10),
        ));
        let config = Arc::new(test_config());

        let svc = ProxyService::new(cert_cache, pool, config);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_handle = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let io = TokioIo::new(stream);
            let hyper_svc =
                hyper_util::service::TowerToHyperService::new(svc);
            hyper_util::server::conn::auto::Builder::new(
                hyper_util::rt::TokioExecutor::new(),
            )
            .serve_connection_with_upgrades(io, hyper_svc)
            .await
            .ok();
        });

        // Connect as HTTP/1.1 client and send CONNECT
        let tcp = tokio::net::TcpStream::connect(addr).await.unwrap();
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
        tokio::spawn(conn);

        let req = Request::builder()
            .method(Method::CONNECT)
            .uri("api.openai.com:443")
            .body(Empty::<Bytes>::new())
            .unwrap();

        let resp = sender.send_request(req).await.unwrap();
        // CONNECT should return 200 (the tunnel spawns asynchronously)
        assert_eq!(resp.status(), StatusCode::OK);

        server_handle.abort();
    }

    #[tokio::test]
    async fn test_error_response_missing_authority() {
        let resp = error_response_for(ProxyError::MissingAuthority);
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_error_response_pool_exhausted() {
        let resp = error_response_for(ProxyError::PoolExhausted("api.openai.com".to_string()));
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_error_response_vendor_blocked() {
        let resp = error_response_for(ProxyError::VendorBlocked("evil.ai".to_string()));
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn test_error_response_vendor_unreachable() {
        let resp = error_response_for(ProxyError::VendorUnreachable {
            vendor: "api.openai.com".to_string(),
            source: std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "refused"),
        });
        assert_eq!(resp.status(), StatusCode::BAD_GATEWAY);
    }

    fn create_test_cert_cache() -> Arc<CertCache> {
        let mut params =
            rcgen::CertificateParams::new(Vec::<String>::new()).expect("empty SAN list");
        params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
        params
            .distinguished_name
            .push(rcgen::DnType::CommonName, "Test CA");

        let key_pair = rcgen::KeyPair::generate().expect("key generation");
        let cert = params.self_signed(&key_pair).expect("self-signed CA cert");

        Arc::new(CertCache::new(cert, key_pair))
    }

    fn test_config() -> Config {
        Config {
            proxy: crate::config::ProxyConfig {
                listen_addr: "127.0.0.1:8443".to_string(),
                connect_timeout_ms: 10_000,
                first_byte_timeout_ms: 30_000,
                stream_timeout_ms: 300_000,
                max_request_queue: 1024,
            },
            tls: crate::config::TlsConfig {
                ca_cert_path: "/tmp/test-ca.crt".to_string(),
                ca_key_path: "/tmp/test-ca.key".to_string(),
            },
            pool: crate::config::PoolConfig {
                max_connections_per_vendor: 4,
                max_streams_per_connection: 100,
                idle_timeout_ms: 60_000,
            },
            allowlist: crate::config::AllowlistConfig {
                vendors: vec!["api.openai.com".to_string()],
            },
            logging: crate::config::LoggingConfig {
                level: "info".to_string(),
                format: "json".to_string(),
            },
            policy: crate::config::PolicyEngineConfig::default(),
        }
    }
}
