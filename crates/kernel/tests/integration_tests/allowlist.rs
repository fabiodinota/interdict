//! Vendor allowlist integration tests.
//!
//! Validates deny-by-default vendor blocking at the proxy level:
//! - Allowed vendors pass through
//! - Blocked vendors get 403 with structured JSON
//! - Empty allowlist blocks everything
//! - Exact domain matching (no substring)

use super::helpers::TestProxy;
use bytes::Bytes;
use http::{Method, Request, StatusCode};
use http_body_util::Full;

/// Test that requests to an allowed vendor pass through successfully.
///
/// Proves: allowlist correctly permits configured vendors.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_allowed_vendor_passes() {
    let proxy = TestProxy::new(vec!["127.0.0.1".to_string()]).await;

    let backend = proxy
        .create_mock_backend(
            StatusCode::OK,
            "application/json",
            b"{\"result\":\"success\"}".to_vec(),
        )
        .await;

    let req = Request::builder()
        .method(Method::GET)
        .uri("/v1/models")
        .header("host", "127.0.0.1")
        .body(Full::new(Bytes::new()))
        .unwrap();

    let (status, _headers, body) = proxy
        .send_through_tunnel("127.0.0.1", backend.port(), req)
        .await
        .expect("allowed vendor request should succeed");

    assert_eq!(status, StatusCode::OK);
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["result"], "success");
}

/// Test that requests to a blocked vendor get 403 Forbidden with JSON error body.
///
/// Proves: deny-by-default blocks non-allowlisted vendors with correct JSON structure.
/// Validates exact JSON error structure from CONTEXT.md: error=vendor_blocked, vendor field.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_blocked_vendor_gets_403() {
    // Only allow "allowed-vendor.test" -- "blocked-vendor.test" is not on the list
    let proxy = TestProxy::new(vec!["allowed-vendor.test".to_string()]).await;

    let (status, body) = proxy
        .send_connect_only("blocked-vendor.test", 443)
        .await
        .expect("blocked vendor CONNECT should return response");

    assert_eq!(status, StatusCode::FORBIDDEN);

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"], "vendor_blocked");
    assert_eq!(json["vendor"], "blocked-vendor.test");
}

/// Test that an empty allowlist blocks everything (deny-by-default).
///
/// Proves: with no vendors configured, all traffic is blocked.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_empty_allowlist_blocks_everything() {
    let proxy = TestProxy::new(vec![]).await;

    let (status, body) = proxy
        .send_connect_only("any-vendor.test", 443)
        .await
        .expect("request should return response");

    assert_eq!(status, StatusCode::FORBIDDEN);

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"], "vendor_blocked");
}

/// Test that allowlist uses exact domain matching, not substring matching.
///
/// Proves: "api.openai.com" on the allowlist does NOT match "openai.com".
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_allowlist_exact_match_only() {
    let proxy = TestProxy::new(vec!["api.openai.com".to_string()]).await;

    // "openai.com" (without "api." prefix) should be blocked
    let (status, body) = proxy
        .send_connect_only("openai.com", 443)
        .await
        .expect("request should return response");

    assert_eq!(status, StatusCode::FORBIDDEN);

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"], "vendor_blocked");
    assert_eq!(json["vendor"], "openai.com");
}
