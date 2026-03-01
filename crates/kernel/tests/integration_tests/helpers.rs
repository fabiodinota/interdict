//! Test infrastructure for integration tests.
//!
//! Provides `TestProxy` which manages a proxy instance on a random port
//! with a programmatically generated test CA, and `MockBackend` which
//! provides a TLS-enabled mock HTTP server that the proxy can connect to.
//!
//! KERN-13: No unbounded channels. All channels are bounded (watch, mpsc).

use bytes::Bytes;
use http::{Method, Request, StatusCode};
use http_body_util::{BodyExt, Empty, Full, StreamBody};
use hyper::body::Frame;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto;
use hyper_util::service::TowerToHyperService;
use kernel::config::{AllowlistConfig, Config, LoggingConfig, PoolConfig, ProxyConfig, TlsConfig};
use kernel::middleware;
use kernel::proxy::ProxyService;
use kernel::proxy::pool::ConnectionPool;
use kernel::proxy::tls::CertCache;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio_stream::wrappers::ReceiverStream;
use tower::ServiceBuilder;

/// A test proxy instance with isolated state.
pub struct TestProxy {
    /// Address the proxy is listening on.
    pub addr: SocketAddr,
    /// The test CA certificate in DER format (for client trust).
    pub ca_cert_der: Vec<u8>,
    /// The test CA certificate PEM.
    pub ca_cert_pem: String,
    /// The test CA key PEM (needed for creating mock backends).
    pub ca_key_pem: String,
    /// Optional handle to the PolicySetManager for tests that need .swap().
    #[allow(dead_code)]
    pub policy_set_manager: Option<Arc<kernel::policy::hot_reload::PolicySetManager>>,
    /// Shutdown signal sender.
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    /// Server task handle.
    _server_handle: tokio::task::JoinHandle<()>,
}

/// Configuration for creating a test proxy.
pub struct TestProxyConfig {
    pub allowlist: Vec<String>,
    pub max_connections_per_vendor: usize,
    pub max_streams_per_connection: usize,
    pub max_request_queue: usize,
    pub connect_timeout_ms: u64,
    pub stream_timeout_ms: u64,
    /// Optional content inspector for PII detection in CONNECT tunnels.
    pub content_inspector: Option<Arc<kernel::policy::content_inspection::ContentInspector>>,
    /// Optional policy set manager for hot-reload enforcement.
    pub policy_set_manager: Option<Arc<kernel::policy::hot_reload::PolicySetManager>>,
}

impl Default for TestProxyConfig {
    fn default() -> Self {
        Self {
            allowlist: vec![],
            max_connections_per_vendor: 4,
            max_streams_per_connection: 100,
            max_request_queue: 1024,
            connect_timeout_ms: 10_000,
            stream_timeout_ms: 300_000,
            content_inspector: None,
            policy_set_manager: None,
        }
    }
}

impl TestProxy {
    /// Create a new test proxy with the given vendor allowlist.
    pub async fn new(allowlist: Vec<String>) -> Self {
        Self::with_config(TestProxyConfig {
            allowlist,
            ..Default::default()
        })
        .await
    }

    /// Create a new test proxy with full configuration control.
    pub async fn with_config(test_config: TestProxyConfig) -> Self {
        let (ca_cert, ca_key, ca_cert_pem, ca_key_pem, ca_cert_der) = generate_test_ca();
        let cert_cache = Arc::new(CertCache::new(ca_cert, ca_key));

        let mut root_store = rustls::RootCertStore::empty();
        root_store
            .add(rustls::pki_types::CertificateDer::from(ca_cert_der.clone()))
            .expect("test CA cert should be valid");

        let pool_config = PoolConfig {
            max_connections_per_vendor: test_config.max_connections_per_vendor,
            max_streams_per_connection: test_config.max_streams_per_connection,
            idle_timeout_ms: 60_000,
        };
        let connect_timeout = Duration::from_millis(test_config.connect_timeout_ms);
        let pool = Arc::new(ConnectionPool::new_with_roots(
            &pool_config,
            connect_timeout,
            root_store,
        ));

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind to random port");
        let addr = listener.local_addr().expect("local addr");

        let config = Arc::new(Config {
            proxy: ProxyConfig {
                listen_addr: addr.to_string(),
                connect_timeout_ms: test_config.connect_timeout_ms,
                first_byte_timeout_ms: 30_000,
                stream_timeout_ms: test_config.stream_timeout_ms,
                max_request_queue: test_config.max_request_queue,
            },
            tls: TlsConfig {
                ca_cert_path: "/not/used/in/tests".to_string(),
                ca_key_path: "/not/used/in/tests".to_string(),
            },
            pool: pool_config,
            allowlist: AllowlistConfig {
                vendors: test_config.allowlist.clone(),
            },
            logging: LoggingConfig {
                level: "warn".to_string(),
                format: "pretty".to_string(),
            },
            policy: kernel::config::PolicyEngineConfig::default(),
        });

        let allowlist = Arc::new(middleware::allowlist::VendorAllowlist::from_config(
            &config.allowlist,
        ));

        // Clone PSM Arc before moving into ProxyService (tests need the handle)
        let psm_handle = test_config.policy_set_manager.clone();

        let proxy_service = if test_config.policy_set_manager.is_some() {
            // Build a minimal PolicyPipeline for tests that need enforcement
            let regorus_pool = Arc::new(kernel::policy::layer1::regorus::RegorusPool::new(
                &regorus::Engine::new(),
                1,
            ));
            let allowlist_policy = Arc::new(
                kernel::policy::layer1::allowlist::VendorAllowlistPolicy::new(allowlist.clone()),
            );
            let classifier = Arc::new(kernel::policy::layer2::classifier::Classifier::stub(
                vec![
                    "allow".into(),
                    "block".into(),
                    "redact".into(),
                    "uncertain".into(),
                ],
                "uncertain".into(),
            ));
            let redaction_engine = Arc::new(kernel::policy::redaction::RedactionEngine::empty());
            let review_store = Arc::new(
                kernel::policy::layer3::store::ReviewQueueStore::new(":memory:")
                    .expect("in-memory review store"),
            );
            let review_queue = Arc::new(kernel::policy::layer3::queue::ReviewQueue::new(
                review_store,
                100,
                Duration::from_secs(30),
            ));
            let wasm_engine = Arc::new(
                kernel::policy::wasm_engine::WasmEngine::new(
                    &kernel::config::PolicyEngineConfig::default(),
                )
                .expect("WasmEngine"),
            );
            let pipeline = Arc::new(kernel::policy::PolicyPipeline::new(
                regorus_pool,
                allowlist_policy,
                classifier,
                None,
                review_queue,
                redaction_engine,
                wasm_engine,
                vec![],
            ));
            let evidence_buffer = Arc::new(kernel::evidence::EvidenceBuffer::stub());

            let mut svc = ProxyService::with_distribution(
                cert_cache.clone(),
                pool.clone(),
                config.clone(),
                pipeline,
                evidence_buffer,
                false,
                test_config.policy_set_manager,
                None,
            );
            if let Some(inspector) = test_config.content_inspector {
                svc = svc.with_content_inspector(inspector);
            }
            svc
        } else {
            let mut svc = ProxyService::new(cert_cache.clone(), pool.clone(), config.clone());
            if let Some(inspector) = test_config.content_inspector {
                svc = svc.with_content_inspector(inspector);
            }
            svc
        };

        // KERN-13: watch channel is bounded (single value)
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

        let server_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        let (stream, _addr) = match accept_result {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        let allowlist = allowlist.clone();
                        let proxy_service = proxy_service.clone();

                        tokio::spawn(async move {
                            let tower_svc = ServiceBuilder::new()
                                .layer(middleware::request_id::RequestIdLayer::new())
                                .layer(middleware::allowlist::AllowlistLayer::new(allowlist))
                                .service(proxy_service);

                            let hyper_svc = TowerToHyperService::new(tower_svc);
                            let io = TokioIo::new(stream);
                            let builder = auto::Builder::new(TokioExecutor::new());
                            let conn = builder.serve_connection_with_upgrades(io, hyper_svc);
                            let _ = conn.await;
                        });
                    }
                    _ = shutdown_rx.changed() => {
                        break;
                    }
                }
            }
        });

        wait_for_ready(addr).await;

        TestProxy {
            addr,
            ca_cert_der,
            ca_cert_pem,
            ca_key_pem,
            policy_set_manager: psm_handle,
            shutdown_tx,
            _server_handle: server_handle,
        }
    }

    /// Build a rustls ClientConfig that trusts this test proxy's CA.
    pub fn client_tls_config(&self) -> Arc<rustls::ClientConfig> {
        let mut root_store = rustls::RootCertStore::empty();
        root_store
            .add(rustls::pki_types::CertificateDer::from(
                self.ca_cert_der.clone(),
            ))
            .expect("add test CA to root store");

        Arc::new(
            rustls::ClientConfig::builder()
                .with_root_certificates(root_store)
                .with_no_client_auth(),
        )
    }

    /// Perform a full CONNECT tunnel request and return the response.
    pub async fn send_through_tunnel(
        &self,
        target_host: &str,
        target_port: u16,
        request: Request<Full<Bytes>>,
    ) -> Result<(StatusCode, hyper::HeaderMap, Bytes), Box<dyn std::error::Error + Send + Sync>>
    {
        let tcp = tokio::net::TcpStream::connect(self.addr).await?;
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::spawn(conn.with_upgrades());

        let connect_uri = format!("{}:{}", target_host, target_port);
        let connect_req = Request::builder()
            .method(Method::CONNECT)
            .uri(&connect_uri)
            .body(Empty::<Bytes>::new())?;

        let connect_resp = sender.send_request(connect_req).await?;

        if connect_resp.status() != StatusCode::OK {
            let status = connect_resp.status();
            let headers = connect_resp.headers().clone();
            let body = connect_resp.into_body().collect().await?.to_bytes();
            return Ok((status, headers, body));
        }

        let upgraded = hyper::upgrade::on(connect_resp).await?;
        let tls_connector = tokio_rustls::TlsConnector::from(self.client_tls_config());
        let server_name = rustls::pki_types::ServerName::try_from(target_host.to_string())?;
        let tls_stream = tls_connector
            .connect(server_name, TokioIo::new(upgraded))
            .await?;

        let io = TokioIo::new(tls_stream);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::spawn(conn);

        let resp = sender.send_request(request).await?;
        let status = resp.status();
        let headers = resp.headers().clone();
        let body = resp.into_body().collect().await?.to_bytes();

        Ok((status, headers, body))
    }

    /// Send a direct (non-CONNECT) request to the proxy.
    pub async fn send_direct(
        &self,
        method: Method,
        uri: &str,
    ) -> Result<(StatusCode, Bytes), Box<dyn std::error::Error + Send + Sync>> {
        let tcp = tokio::net::TcpStream::connect(self.addr).await?;
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::spawn(conn);

        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header("host", "api.openai.com")
            .body(Empty::<Bytes>::new())?;

        let resp = sender.send_request(req).await?;
        let status = resp.status();
        let body = resp.into_body().collect().await?.to_bytes();
        Ok((status, body))
    }

    /// Send a CONNECT request and return just the CONNECT status.
    pub async fn send_connect_only(
        &self,
        target_host: &str,
        target_port: u16,
    ) -> Result<(StatusCode, Bytes), Box<dyn std::error::Error + Send + Sync>> {
        let tcp = tokio::net::TcpStream::connect(self.addr).await?;
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::spawn(conn.with_upgrades());

        let connect_uri = format!("{}:{}", target_host, target_port);
        let connect_req = Request::builder()
            .method(Method::CONNECT)
            .uri(&connect_uri)
            .body(Empty::<Bytes>::new())?;

        let connect_resp = sender.send_request(connect_req).await?;
        let status = connect_resp.status();
        let body = connect_resp.into_body().collect().await?.to_bytes();
        Ok((status, body))
    }

    /// Get a raw TLS stream through a CONNECT tunnel (for streaming tests).
    ///
    /// Returns the TLS stream after CONNECT + upgrade + TLS handshake.
    /// The caller can then do HTTP request/response over it.
    pub async fn connect_tunnel(
        &self,
        target_host: &str,
        target_port: u16,
    ) -> Result<
        tokio_rustls::client::TlsStream<TokioIo<hyper::upgrade::Upgraded>>,
        Box<dyn std::error::Error + Send + Sync>,
    > {
        let tcp = tokio::net::TcpStream::connect(self.addr).await?;
        let io = TokioIo::new(tcp);
        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::spawn(conn.with_upgrades());

        let connect_uri = format!("{}:{}", target_host, target_port);
        let connect_req = Request::builder()
            .method(Method::CONNECT)
            .uri(&connect_uri)
            .body(Empty::<Bytes>::new())?;

        let connect_resp = sender.send_request(connect_req).await?;
        assert_eq!(
            connect_resp.status(),
            StatusCode::OK,
            "CONNECT should succeed"
        );

        let upgraded = hyper::upgrade::on(connect_resp).await?;
        let tls_connector = tokio_rustls::TlsConnector::from(self.client_tls_config());
        let server_name = rustls::pki_types::ServerName::try_from(target_host.to_string())?;
        let tls_stream = tls_connector
            .connect(server_name, TokioIo::new(upgraded))
            .await?;

        Ok(tls_stream)
    }

    /// Create a mock backend whose TLS certs are signed by this proxy's test CA.
    pub async fn create_mock_backend(
        &self,
        status: StatusCode,
        content_type: &str,
        body: Vec<u8>,
    ) -> MockBackend {
        MockBackend::fixed_response(
            &self.ca_cert_pem,
            &self.ca_key_pem,
            status,
            content_type,
            body,
        )
        .await
    }

    /// Create a streaming SSE mock backend signed by this proxy's test CA.
    pub async fn create_sse_backend(
        &self,
        chunks: Vec<String>,
        delay_between_ms: u64,
    ) -> MockBackend {
        MockBackend::sse_streaming(
            &self.ca_cert_pem,
            &self.ca_key_pem,
            chunks,
            delay_between_ms,
        )
        .await
    }

    /// Create a delayed-response mock backend signed by this proxy's test CA.
    #[allow(dead_code)]
    pub async fn create_delayed_backend(&self, delay: Duration, status: StatusCode) -> MockBackend {
        MockBackend::delayed_response(&self.ca_cert_pem, &self.ca_key_pem, delay, status).await
    }
}

impl Drop for TestProxy {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(true);
    }
}

/// A mock TLS-enabled HTTP backend server.
pub struct MockBackend {
    /// Address the mock is listening on.
    pub addr: SocketAddr,
    /// Server task handle.
    _server_handle: tokio::task::JoinHandle<()>,
    /// Shutdown sender.
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

impl MockBackend {
    /// Create a mock backend that returns a fixed response for every request.
    pub async fn fixed_response(
        ca_cert_pem: &str,
        ca_key_pem: &str,
        status: StatusCode,
        content_type: &str,
        body: Vec<u8>,
    ) -> Self {
        let (server_config, addr, listener) =
            create_tls_server_with_ca(ca_cert_pem, ca_key_pem, "127.0.0.1").await;

        let content_type = content_type.to_string();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

        let server_handle = tokio::spawn(async move {
            let tls_acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        let (stream, _) = match accept_result {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        let tls_acceptor = tls_acceptor.clone();
                        let body = body.clone();
                        let content_type = content_type.clone();

                        tokio::spawn(async move {
                            let tls_stream = match tls_acceptor.accept(stream).await {
                                Ok(s) => s,
                                Err(_) => return,
                            };
                            let io = TokioIo::new(tls_stream);
                            let svc = hyper::service::service_fn(move |_req: Request<hyper::body::Incoming>| {
                                let body = body.clone();
                                let ct = content_type.clone();
                                async move {
                                    Ok::<_, std::convert::Infallible>(
                                        hyper::Response::builder()
                                            .status(status)
                                            .header("content-type", ct)
                                            .body(Full::new(Bytes::from(body)))
                                            .unwrap()
                                    )
                                }
                            });
                            let _ = auto::Builder::new(TokioExecutor::new())
                                .serve_connection(io, svc)
                                .await;
                        });
                    }
                    _ = shutdown_rx.changed() => break,
                }
            }
        });

        wait_for_ready(addr).await;
        MockBackend {
            addr,
            _server_handle: server_handle,
            shutdown_tx,
        }
    }

    /// Create a mock backend that sends SSE-style chunked responses with delays.
    pub async fn sse_streaming(
        ca_cert_pem: &str,
        ca_key_pem: &str,
        chunks: Vec<String>,
        delay_between_ms: u64,
    ) -> Self {
        let (server_config, addr, listener) =
            create_tls_server_with_ca(ca_cert_pem, ca_key_pem, "127.0.0.1").await;

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

        let server_handle = tokio::spawn(async move {
            let tls_acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        let (stream, _) = match accept_result {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        let tls_acceptor = tls_acceptor.clone();
                        let chunks = chunks.clone();

                        tokio::spawn(async move {
                            let tls_stream = match tls_acceptor.accept(stream).await {
                                Ok(s) => s,
                                Err(_) => return,
                            };
                            let io = TokioIo::new(tls_stream);

                            let svc = hyper::service::service_fn(move |_req: Request<hyper::body::Incoming>| {
                                let chunks = chunks.clone();
                                async move {
                                    // KERN-13: bounded mpsc channel for streaming
                                    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Frame<Bytes>, std::convert::Infallible>>(32);

                                    tokio::spawn(async move {
                                        for chunk in chunks {
                                            let frame = Frame::data(Bytes::from(chunk));
                                            if tx.send(Ok(frame)).await.is_err() {
                                                break;
                                            }
                                            if delay_between_ms > 0 {
                                                tokio::time::sleep(Duration::from_millis(delay_between_ms)).await;
                                            }
                                        }
                                        // Drop tx to signal end of stream
                                    });

                                    let stream = ReceiverStream::new(rx);
                                    let body = StreamBody::new(stream);

                                    Ok::<_, std::convert::Infallible>(
                                        hyper::Response::builder()
                                            .status(200u16)
                                            .header("content-type", "text/event-stream")
                                            .header("cache-control", "no-cache")
                                            .body(body)
                                            .unwrap()
                                    )
                                }
                            });
                            let _ = auto::Builder::new(TokioExecutor::new())
                                .serve_connection(io, svc)
                                .await;
                        });
                    }
                    _ = shutdown_rx.changed() => break,
                }
            }
        });

        wait_for_ready(addr).await;
        MockBackend {
            addr,
            _server_handle: server_handle,
            shutdown_tx,
        }
    }

    /// Create a mock backend that delays each response by the given duration.
    #[allow(dead_code)]
    pub async fn delayed_response(
        ca_cert_pem: &str,
        ca_key_pem: &str,
        delay: Duration,
        status: StatusCode,
    ) -> Self {
        let (server_config, addr, listener) =
            create_tls_server_with_ca(ca_cert_pem, ca_key_pem, "127.0.0.1").await;

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

        let server_handle = tokio::spawn(async move {
            let tls_acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        let (stream, _) = match accept_result {
                            Ok(r) => r,
                            Err(_) => continue,
                        };
                        let tls_acceptor = tls_acceptor.clone();

                        tokio::spawn(async move {
                            let tls_stream = match tls_acceptor.accept(stream).await {
                                Ok(s) => s,
                                Err(_) => return,
                            };
                            let io = TokioIo::new(tls_stream);
                            let svc = hyper::service::service_fn(move |_req: Request<hyper::body::Incoming>| {
                                async move {
                                    tokio::time::sleep(delay).await;
                                    Ok::<_, std::convert::Infallible>(
                                        hyper::Response::builder()
                                            .status(status)
                                            .header("content-type", "application/json")
                                            .body(Full::new(Bytes::from(r#"{"status":"ok"}"#)))
                                            .unwrap()
                                    )
                                }
                            });
                            let _ = auto::Builder::new(TokioExecutor::new())
                                .serve_connection(io, svc)
                                .await;
                        });
                    }
                    _ = shutdown_rx.changed() => break,
                }
            }
        });

        wait_for_ready(addr).await;
        MockBackend {
            addr,
            _server_handle: server_handle,
            shutdown_tx,
        }
    }

    /// Get the backend's port.
    pub fn port(&self) -> u16 {
        self.addr.port()
    }
}

impl Drop for MockBackend {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(true);
    }
}

// --- Internal helpers ---

fn generate_test_ca() -> (rcgen::Certificate, rcgen::KeyPair, String, String, Vec<u8>) {
    let mut params = rcgen::CertificateParams::new(Vec::<String>::new()).expect("empty SAN list");
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "Interdict Test CA");
    params
        .distinguished_name
        .push(rcgen::DnType::OrganizationName, "Interdict Test");

    let key_pair = rcgen::KeyPair::generate().expect("key generation");
    let cert = params.self_signed(&key_pair).expect("self-signed CA cert");

    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();
    let cert_der = cert.der().to_vec();

    (cert, key_pair, cert_pem, key_pem, cert_der)
}

async fn create_tls_server_with_ca(
    ca_cert_pem: &str,
    ca_key_pem: &str,
    hostname: &str,
) -> (rustls::ServerConfig, SocketAddr, TcpListener) {
    let ca_key = rcgen::KeyPair::from_pem(ca_key_pem).expect("parse CA key");
    let ca_params = rcgen::CertificateParams::from_ca_cert_pem(ca_cert_pem).expect("parse CA cert");
    let ca_cert = ca_params.self_signed(&ca_key).expect("reconstruct CA cert");

    let san = rcgen::SanType::IpAddress(
        "127.0.0.1"
            .parse::<std::net::IpAddr>()
            .expect("parse 127.0.0.1"),
    );
    let mut ee_params =
        rcgen::CertificateParams::new(vec![hostname.to_string()]).expect("server cert params");
    ee_params.is_ca = rcgen::IsCa::NoCa;
    ee_params.subject_alt_names.push(san);

    let ee_key = rcgen::KeyPair::generate().expect("server key generation");
    let ee_cert = ee_params
        .signed_by(&ee_key, &ca_cert, &ca_key)
        .expect("sign server cert");

    let cert_chain = vec![ee_cert.into()];
    let private_key = rustls::pki_types::PrivatePkcs8KeyDer::from(ee_key.serialized_der().to_vec());

    let server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key.into())
        .expect("build server TLS config");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind mock server");
    let addr = listener.local_addr().expect("mock server addr");

    (server_config, addr, listener)
}

async fn wait_for_ready(addr: SocketAddr) {
    for _ in 0..50 {
        if tokio::net::TcpStream::connect(addr).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("server at {} did not become ready within 500ms", addr);
}
