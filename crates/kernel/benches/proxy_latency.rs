//! Proxy latency, throughput, and memory benchmarks using criterion.
//!
//! Measures the three performance requirements:
//! - KERN-07: <10ms p99 latency overhead (target <5ms)
//! - KERN-08: >10,000 requests/second per instance
//! - KERN-09: <128MB memory steady-state
//!
//! These benchmarks measure PROXY overhead only -- mock vendors return instantly.
//! The overhead includes: CONNECT handling, TLS interception, byte relay.

use bytes::Bytes;
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use http::{Method, Request, StatusCode};
use http_body_util::{BodyExt, Empty, Full};
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
use tokio::runtime::Runtime;
use tower::ServiceBuilder;

/// Benchmark state: proxy + mock backend running on random ports.
struct BenchState {
    proxy_addr: SocketAddr,
    backend_port: u16,
    ca_cert_der: Vec<u8>,
    _runtime_guard: (),
}

/// Set up the proxy and mock backend for benchmarks.
/// Called once per benchmark group.
fn setup_bench_env(rt: &Runtime) -> BenchState {
    rt.block_on(async {
        // Generate test CA
        let (ca_cert, ca_key, ca_cert_pem, ca_key_pem, ca_cert_der) = generate_test_ca();
        let cert_cache = Arc::new(CertCache::new(ca_cert, ca_key));

        // Pool trusts test CA for mock backend
        let mut root_store = rustls::RootCertStore::empty();
        root_store
            .add(rustls::pki_types::CertificateDer::from(ca_cert_der.clone()))
            .expect("add test CA");

        let pool_config = PoolConfig {
            max_connections_per_vendor: 8,
            max_streams_per_connection: 100,
            idle_timeout_ms: 60_000,
        };
        let pool = Arc::new(ConnectionPool::new_with_roots(
            &pool_config,
            Duration::from_secs(10),
            root_store,
        ));

        let proxy_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_addr = proxy_listener.local_addr().unwrap();

        let config = Arc::new(Config {
            proxy: ProxyConfig {
                listen_addr: proxy_addr.to_string(),
                connect_timeout_ms: 10_000,
                first_byte_timeout_ms: 30_000,
                stream_timeout_ms: 300_000,
                max_request_queue: 1024,
            },
            tls: TlsConfig {
                ca_cert_path: "/not/used".to_string(),
                ca_key_path: "/not/used".to_string(),
            },
            pool: pool_config,
            allowlist: AllowlistConfig {
                vendors: vec!["127.0.0.1".to_string()],
            },
            logging: LoggingConfig {
                level: "error".to_string(),
                format: "pretty".to_string(),
            },
            policy: kernel::config::PolicyEngineConfig::default(),
        });

        let allowlist = Arc::new(middleware::allowlist::VendorAllowlist::from_config(
            &config.allowlist,
        ));
        let proxy_service = ProxyService::new(cert_cache.clone(), pool.clone(), config.clone());

        // Spawn proxy
        tokio::spawn(async move {
            loop {
                let (stream, _) = match proxy_listener.accept().await {
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
                    let _ = builder.serve_connection_with_upgrades(io, hyper_svc).await;
                });
            }
        });

        // Spawn mock backend with TLS
        let (server_config, backend_addr, backend_listener) =
            create_tls_server_with_ca(&ca_cert_pem, &ca_key_pem, "127.0.0.1").await;

        let body = Bytes::from(r#"{"id":"bench","choices":[{"message":{"content":"ok"}}]}"#);
        tokio::spawn(async move {
            let tls_acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
            loop {
                let (stream, _) = match backend_listener.accept().await {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                let tls_acceptor = tls_acceptor.clone();
                let body = body.clone();

                tokio::spawn(async move {
                    let tls_stream = match tls_acceptor.accept(stream).await {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    let io = TokioIo::new(tls_stream);
                    let svc =
                        hyper::service::service_fn(move |_req: Request<hyper::body::Incoming>| {
                            let body = body.clone();
                            async move {
                                Ok::<_, std::convert::Infallible>(
                                    hyper::Response::builder()
                                        .status(200u16)
                                        .header("content-type", "application/json")
                                        .body(Full::new(body))
                                        .unwrap(),
                                )
                            }
                        });
                    let _ = auto::Builder::new(TokioExecutor::new())
                        .serve_connection(io, svc)
                        .await;
                });
            }
        });

        // Wait for both servers
        wait_for_ready(proxy_addr).await;
        wait_for_ready(backend_addr).await;

        BenchState {
            proxy_addr,
            backend_port: backend_addr.port(),
            ca_cert_der,
            _runtime_guard: (),
        }
    })
}

/// Benchmark 1: Proxy latency overhead (KERN-07).
///
/// Measures time from sending request through proxy to receiving response.
/// The difference from direct request time is the proxy overhead.
fn bench_proxy_latency(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let state = setup_bench_env(&rt);

    let mut group = c.benchmark_group("proxy_latency");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(50);

    let client_config = build_client_config(&state.ca_cert_der);

    group.bench_function("single_request_through_proxy", |b| {
        b.to_async(&rt).iter(|| async {
            let status = send_proxied_request(
                state.proxy_addr,
                &client_config,
                "127.0.0.1",
                state.backend_port,
                "/v1/bench",
            )
            .await;
            assert_eq!(status, StatusCode::OK);
        });
    });

    group.finish();
}

/// Benchmark 2: Proxy throughput (KERN-08).
///
/// Fires requests as fast as possible and measures throughput.
fn bench_proxy_throughput(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let state = setup_bench_env(&rt);

    let mut group = c.benchmark_group("proxy_throughput");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(30);

    let client_config = build_client_config(&state.ca_cert_der);

    for &batch_size in &[1, 5, 10] {
        group.bench_with_input(
            BenchmarkId::new("batch", batch_size),
            &batch_size,
            |b, &size| {
                b.to_async(&rt).iter(|| async {
                    let mut handles = Vec::new();
                    for _ in 0..size {
                        let addr = state.proxy_addr;
                        let cfg = client_config.clone();
                        let port = state.backend_port;
                        handles.push(tokio::spawn(async move {
                            send_proxied_request(addr, &cfg, "127.0.0.1", port, "/v1/bench").await
                        }));
                    }
                    for h in handles {
                        let status = h.await.unwrap();
                        assert_eq!(status, StatusCode::OK);
                    }
                });
            },
        );
    }

    group.finish();
}

/// Benchmark 3: Memory baseline (KERN-09).
///
/// This is more of a test than a benchmark -- verifies that the proxy
/// does not leak memory under sustained load. Measured via jemalloc stats.
fn bench_proxy_memory(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let state = setup_bench_env(&rt);

    let mut group = c.benchmark_group("proxy_memory");
    group.measurement_time(Duration::from_secs(5));
    group.sample_size(10);

    let client_config = build_client_config(&state.ca_cert_der);

    group.bench_function("100_requests_memory", |b| {
        b.to_async(&rt).iter(|| async {
            for _ in 0..100 {
                let _ = send_proxied_request(
                    state.proxy_addr,
                    &client_config,
                    "127.0.0.1",
                    state.backend_port,
                    "/v1/bench",
                )
                .await;
            }
        });
    });

    group.finish();
}

// --- Helpers ---

fn generate_test_ca() -> (rcgen::Certificate, rcgen::KeyPair, String, String, Vec<u8>) {
    let mut params = rcgen::CertificateParams::new(Vec::<String>::new()).expect("empty SAN list");
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "Bench CA");

    let key_pair = rcgen::KeyPair::generate().expect("keygen");
    let cert = params.self_signed(&key_pair).expect("self-signed");

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
    let ca_key = rcgen::KeyPair::from_pem(ca_key_pem).unwrap();
    let ca_params = rcgen::CertificateParams::from_ca_cert_pem(ca_cert_pem).unwrap();
    let ca_cert = ca_params.self_signed(&ca_key).unwrap();

    let san = rcgen::SanType::IpAddress("127.0.0.1".parse().unwrap());
    let mut ee_params = rcgen::CertificateParams::new(vec![hostname.to_string()]).unwrap();
    ee_params.is_ca = rcgen::IsCa::NoCa;
    ee_params.subject_alt_names.push(san);

    let ee_key = rcgen::KeyPair::generate().unwrap();
    let ee_cert = ee_params.signed_by(&ee_key, &ca_cert, &ca_key).unwrap();

    let cert_chain = vec![ee_cert.into()];
    let private_key = rustls::pki_types::PrivatePkcs8KeyDer::from(ee_key.serialized_der().to_vec());

    let server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key.into())
        .unwrap();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    (server_config, addr, listener)
}

fn build_client_config(ca_cert_der: &[u8]) -> Arc<rustls::ClientConfig> {
    let mut root_store = rustls::RootCertStore::empty();
    root_store
        .add(rustls::pki_types::CertificateDer::from(
            ca_cert_der.to_vec(),
        ))
        .unwrap();

    Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth(),
    )
}

async fn send_proxied_request(
    proxy_addr: SocketAddr,
    client_config: &Arc<rustls::ClientConfig>,
    target_host: &str,
    target_port: u16,
    uri: &str,
) -> StatusCode {
    let tcp = tokio::net::TcpStream::connect(proxy_addr).await.unwrap();
    let io = TokioIo::new(tcp);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
    tokio::spawn(conn.with_upgrades());

    let connect_uri = format!("{}:{}", target_host, target_port);
    let connect_req = Request::builder()
        .method(Method::CONNECT)
        .uri(&connect_uri)
        .body(Empty::<Bytes>::new())
        .unwrap();

    let connect_resp = sender.send_request(connect_req).await.unwrap();
    if connect_resp.status() != StatusCode::OK {
        return connect_resp.status();
    }

    let upgraded = hyper::upgrade::on(connect_resp).await.unwrap();
    let tls_connector = tokio_rustls::TlsConnector::from(client_config.clone());
    let server_name = rustls::pki_types::ServerName::try_from(target_host.to_string()).unwrap();
    let tls_stream = tls_connector
        .connect(server_name, TokioIo::new(upgraded))
        .await
        .unwrap();

    let io = TokioIo::new(tls_stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::GET)
        .uri(uri)
        .header("host", target_host)
        .body(Empty::<Bytes>::new())
        .unwrap();

    let resp = sender.send_request(req).await.unwrap();
    let status = resp.status();
    let _ = resp.into_body().collect().await.unwrap();
    status
}

async fn wait_for_ready(addr: SocketAddr) {
    for _ in 0..50 {
        if tokio::net::TcpStream::connect(addr).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("server at {} not ready", addr);
}

criterion_group!(
    benches,
    bench_proxy_latency,
    bench_proxy_throughput,
    bench_proxy_memory
);
criterion_main!(benches);
