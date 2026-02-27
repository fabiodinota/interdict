//! SSE streaming and HTTP/2 relay integration tests.
//!
//! Validates that the proxy relays SSE-style streaming responses incrementally
//! without buffering, and that HTTP/2 frame relay works for gRPC-style traffic.

use super::helpers::TestProxy;
use bytes::Bytes;
use http::{Method, Request, StatusCode};
use http_body_util::{BodyExt, Empty, Full};
use hyper_util::rt::TokioIo;
use std::time::{Duration, Instant};

/// Test that SSE streaming responses are delivered incrementally without buffering.
///
/// This is THE critical test for KERN-02 (SSE streaming) and research Pitfall 1
/// (no buffering). The mock vendor sends 5 chunks with 50ms delays between each.
/// The test verifies that the first chunk arrives well before all chunks are sent.
///
/// Proves: The proxy does NOT buffer the full response body before forwarding.
#[tokio::test]
async fn test_sse_streaming_incremental_delivery() {
    let proxy = TestProxy::new(vec!["127.0.0.1".to_string()]).await;

    let chunks: Vec<String> = (0..5).map(|i| format!("data: token_{}\n\n", i)).collect();

    let backend = proxy.create_sse_backend(chunks.clone(), 50).await;

    let tls_stream = proxy
        .connect_tunnel("127.0.0.1", backend.port())
        .await
        .expect("tunnel should establish");

    let io = TokioIo::new(tls_stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake::<_, Empty<Bytes>>(io)
        .await
        .unwrap();
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::GET)
        .uri("/v1/stream")
        .header("host", "127.0.0.1")
        .header("accept", "text/event-stream")
        .body(Empty::<Bytes>::new())
        .unwrap();

    let start = Instant::now();
    let resp = sender.send_request(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let mut body = resp.into_body();
    let mut received_chunks: Vec<String> = Vec::new();
    let mut first_chunk_time: Option<Duration> = None;

    while let Some(frame_result) = body.frame().await {
        match frame_result {
            Ok(frame) => {
                if let Some(data) = frame.data_ref() {
                    let chunk_str = String::from_utf8_lossy(data).to_string();
                    if first_chunk_time.is_none() {
                        first_chunk_time = Some(start.elapsed());
                    }
                    received_chunks.push(chunk_str);
                }
            }
            Err(e) => {
                panic!("error reading stream frame: {}", e);
            }
        }
    }

    let total_time = start.elapsed();

    let first_chunk_ms = first_chunk_time
        .expect("should receive at least one chunk")
        .as_millis();

    // First chunk should arrive within 200ms (generous for TLS overhead).
    // If proxy buffered the full body, first chunk would arrive after ~250ms.
    assert!(
        first_chunk_ms < 200,
        "first chunk should arrive within 200ms, but took {}ms (indicates buffering)",
        first_chunk_ms
    );

    // All chunks received in order
    let all_received: String = received_chunks.join("");
    let all_expected: String = chunks.join("");
    assert_eq!(
        all_received, all_expected,
        "all SSE chunks should be received in order"
    );

    // Total time should be at least ~200ms (the delays)
    assert!(
        total_time.as_millis() >= 150,
        "total time should reflect streaming delays ({}ms)",
        total_time.as_millis()
    );
}

/// Test that large streaming responses (10,000 SSE events) work without issues.
///
/// Proves: streaming works at scale without buffering or memory issues.
#[tokio::test]
async fn test_large_streaming_response() {
    let proxy = TestProxy::new(vec!["127.0.0.1".to_string()]).await;

    let chunks: Vec<String> = (0..10_000)
        .map(|i| format!("data: event_{}\n\n", i))
        .collect();
    let expected_total_len: usize = chunks.iter().map(|c| c.len()).sum();

    let backend = proxy.create_sse_backend(chunks, 0).await;

    let tls_stream = proxy
        .connect_tunnel("127.0.0.1", backend.port())
        .await
        .expect("tunnel should establish");

    let io = TokioIo::new(tls_stream);
    let (mut sender, conn) = hyper::client::conn::http1::handshake::<_, Empty<Bytes>>(io)
        .await
        .unwrap();
    tokio::spawn(conn);

    let req = Request::builder()
        .method(Method::GET)
        .uri("/v1/stream")
        .header("host", "127.0.0.1")
        .header("accept", "text/event-stream")
        .body(Empty::<Bytes>::new())
        .unwrap();

    let resp = sender.send_request(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        body.len(),
        expected_total_len,
        "all 10,000 SSE events should be received"
    );

    let body_str = String::from_utf8_lossy(&body);
    assert!(body_str.starts_with("data: event_0\n\n"));
    assert!(body_str.ends_with("data: event_9999\n\n"));
}

/// Test HTTP/2 frame relay for gRPC-style traffic.
///
/// Since the proxy relays raw bytes bidirectionally, HTTP/2 frames pass through
/// transparently. This test validates that traffic works through the CONNECT tunnel.
#[tokio::test]
async fn test_http2_relay_through_tunnel() {
    let proxy = TestProxy::new(vec!["127.0.0.1".to_string()]).await;

    let expected_body = b"{\"model\":\"gpt-4\",\"status\":\"ok\"}";
    let backend = proxy
        .create_mock_backend(StatusCode::OK, "application/json", expected_body.to_vec())
        .await;

    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/chat")
        .header("host", "127.0.0.1")
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(r#"{"prompt":"test"}"#)))
        .unwrap();

    let (status, _headers, body) = proxy
        .send_through_tunnel("127.0.0.1", backend.port(), req)
        .await
        .expect("relay should work");

    assert_eq!(status, StatusCode::OK);
    assert_eq!(&body[..], expected_body);
}
