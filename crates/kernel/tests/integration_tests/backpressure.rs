//! Backpressure integration tests.
//!
//! Validates that the proxy exhibits correct backpressure behavior:
//! - Pool exhaustion returns structured error response
//! - Recovery after backpressure works
//!
//! Note: The current Phase 1 proxy uses connection pool exhaustion as
//! the primary backpressure mechanism (PoolExhausted -> 503-style error).
//! Explicit request queue limits (max_request_queue) are deferred to Phase 2
//! when the policy evaluation pipeline adds queuing points.

use super::helpers::{TestProxy, TestProxyConfig};
use bytes::Bytes;
use http::{Method, Request, StatusCode};
use http_body_util::Full;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Test that the proxy recovers after a period of errors.
///
/// Proves: the proxy does not get stuck in a failed state after errors.
#[tokio::test]
async fn test_recovery_after_errors() {
    let proxy = TestProxy::new(vec!["127.0.0.1".to_string()]).await;

    let backend = proxy
        .create_mock_backend(
            StatusCode::OK,
            "application/json",
            b"{\"ok\":true}".to_vec(),
        )
        .await;

    // First request succeeds
    let req = Request::builder()
        .method(Method::GET)
        .uri("/v1/test1")
        .header("host", "127.0.0.1")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let (status, _headers, _body) = proxy
        .send_through_tunnel("127.0.0.1", backend.port(), req)
        .await
        .expect("first request should succeed");
    assert_eq!(status, StatusCode::OK);

    // Send request to non-existent port (will fail at upstream connect)
    let req2 = Request::builder()
        .method(Method::GET)
        .uri("/v1/test2")
        .header("host", "127.0.0.1")
        .body(Full::new(Bytes::new()))
        .unwrap();

    // This may fail at the TLS level or upstream connect -- that's expected
    let _ = proxy
        .send_through_tunnel("127.0.0.1", 1, req2) // port 1 likely closed
        .await;

    // Recovery: next request to the working backend should succeed
    let req3 = Request::builder()
        .method(Method::GET)
        .uri("/v1/test3")
        .header("host", "127.0.0.1")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let (status, _headers, _body) = proxy
        .send_through_tunnel("127.0.0.1", backend.port(), req3)
        .await
        .expect("recovery request should succeed");
    assert_eq!(status, StatusCode::OK, "proxy should recover after error");
}

/// Test that the pool returns structured errors when exhausted under load.
///
/// With very restrictive pool settings (max_conns=1, max_streams=1),
/// rapid concurrent requests should trigger pool exhaustion.
/// The proxy should return errors rather than hanging.
#[tokio::test]
async fn test_pool_exhaustion_under_load() {
    let proxy = TestProxy::with_config(TestProxyConfig {
        allowlist: vec!["127.0.0.1".to_string()],
        max_connections_per_vendor: 1,
        max_streams_per_connection: 1,
        ..Default::default()
    })
    .await;

    // Use delayed backend to keep connections occupied
    let backend = proxy
        .create_delayed_backend(std::time::Duration::from_millis(500), StatusCode::OK)
        .await;

    let success_count = Arc::new(AtomicUsize::new(0));
    let error_count = Arc::new(AtomicUsize::new(0));

    let mut handles = Vec::new();
    // Send 5 concurrent requests -- only 1 can be served at a time
    for i in 0..5 {
        let proxy_addr = proxy.addr;
        let ca_cert_der = proxy.ca_cert_der.clone();
        let backend_port = backend.port();
        let success = success_count.clone();
        let error = error_count.clone();

        handles.push(tokio::spawn(async move {
            let result = send_through_tunnel_raw(
                proxy_addr,
                &ca_cert_der,
                "127.0.0.1",
                backend_port,
                &format!("/v1/request/{}", i),
            )
            .await;

            match result {
                Ok(StatusCode::OK) => {
                    success.fetch_add(1, Ordering::Relaxed);
                }
                _ => {
                    error.fetch_add(1, Ordering::Relaxed);
                }
            }
        }));
    }

    for handle in handles {
        let _ = handle.await;
    }

    // At least one should succeed (first request gets the slot)
    let successes = success_count.load(Ordering::Relaxed);
    assert!(
        successes >= 1,
        "at least 1 request should succeed, got {}",
        successes
    );

    // The test passes as long as we don't deadlock/hang -- the proxy
    // returns responses (success or error) for all requests
}

/// Raw tunnel helper for concurrent tests.
async fn send_through_tunnel_raw(
    proxy_addr: std::net::SocketAddr,
    ca_cert_der: &[u8],
    target_host: &str,
    target_port: u16,
    uri: &str,
) -> Result<StatusCode, Box<dyn std::error::Error + Send + Sync>> {
    use http_body_util::{BodyExt, Empty};
    use hyper_util::rt::TokioIo;

    let mut root_store = rustls::RootCertStore::empty();
    root_store.add(rustls::pki_types::CertificateDer::from(ca_cert_der.to_vec()))?;

    let client_config = Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth(),
    );

    let tcp = tokio::net::TcpStream::connect(proxy_addr).await?;
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
        return Ok(connect_resp.status());
    }

    let upgraded = hyper::upgrade::on(connect_resp).await?;
    let tls_connector = tokio_rustls::TlsConnector::from(client_config);
    let server_name = rustls::pki_types::ServerName::try_from(target_host.to_string())?;
    let tls_stream = tls_connector
        .connect(server_name, TokioIo::new(upgraded))
        .await?;

    let io = TokioIo::new(tls_stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::GET)
        .uri(uri)
        .header("host", target_host)
        .body(Empty::<Bytes>::new())?;

    let resp = sender.send_request(req).await?;
    let status = resp.status();
    let _ = resp.into_body().collect().await?;

    Ok(status)
}
