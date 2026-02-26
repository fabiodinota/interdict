//! Structured error types for the Interdict kernel proxy.
//!
//! All errors use `thiserror` for derive-based definitions and provide
//! structured JSON error responses for client-facing errors.

use bytes::Bytes;
use http::Response;
use http_body_util::combinators::BoxBody;
use http_body_util::BodyExt;
use http_body_util::Full;
use serde::Serialize;

use crate::policy::config::BlockResponseDetail;

/// Type alias for boxed HTTP response body used throughout the proxy.
pub type ProxyBody = BoxBody<Bytes, hyper::Error>;

/// All error types that can occur in the proxy pipeline.
#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    /// CONNECT request is missing the authority (host:port) component.
    #[error("missing authority in CONNECT request")]
    MissingAuthority,

    /// Vendor domain is not on the approved allowlist.
    #[error("vendor '{0}' is not on the approved allowlist")]
    VendorBlocked(String),

    /// Upstream vendor is unreachable or connection timed out.
    #[error("vendor '{vendor}' unreachable: {source}")]
    VendorUnreachable {
        vendor: String,
        #[source]
        source: std::io::Error,
    },

    /// TLS handshake or protocol error.
    #[error("TLS error: {0}")]
    Tls(#[from] rustls::Error),

    /// Certificate generation failed.
    #[error("certificate generation error: {0}")]
    CertGeneration(#[from] rcgen::Error),

    /// HTTP upgrade (CONNECT tunnel) failed.
    #[error("upgrade failed: {0}")]
    UpgradeFailed(#[from] hyper::Error),

    /// Request queue is full -- backpressure signal.
    #[error("request queue full")]
    BackpressureFull,

    /// Connection pool has no available connections for the vendor.
    #[error("connection pool exhausted for vendor '{0}'")]
    PoolExhausted(String),

    /// Stream exceeded the configured timeout.
    #[error("stream timeout after {0}ms")]
    StreamTimeout(u64),

    /// Configuration error (fail-closed).
    #[error("config error: {0}")]
    Config(String),

    /// Policy evaluation failed (Rego error, Wasm panic, etc.).
    #[error("policy evaluation error: {0}")]
    PolicyEvaluation(String),

    /// Request blocked by policy enforcement.
    #[error("request blocked by policy '{policy_id}'")]
    PolicyBlocked {
        /// ID of the policy that triggered the block.
        policy_id: String,
        /// Optional reason for blocking.
        reason: Option<String>,
        /// Whether to include details in the response.
        detail: BlockResponseDetail,
    },
}

/// Structured JSON error response body.
#[derive(Serialize)]
struct ErrorResponse {
    error: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout_ms: Option<u64>,
}

/// Helper to create a boxed response body from bytes.
fn full_body(data: Vec<u8>) -> ProxyBody {
    BoxBody::new(Full::new(Bytes::from(data)).map_err(|never| match never {}))
}

/// Build a 403 Forbidden response for blocked vendors.
///
/// Returns a structured JSON body with error type and vendor name.
pub fn vendor_blocked_response(vendor: &str) -> Response<ProxyBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "vendor_blocked",
        vendor: Some(vendor.to_string()),
        message: Some(format!(
            "Vendor '{}' is not on the approved allowlist",
            vendor
        )),
        timeout_ms: None,
    })
    .expect("ErrorResponse serialization should never fail");

    Response::builder()
        .status(http::StatusCode::FORBIDDEN)
        .header("content-type", "application/json")
        .body(full_body(body))
        .expect("Response builder with valid status should never fail")
}

/// Build a 502 Bad Gateway response for unreachable vendors.
///
/// Returns a structured JSON body with error type, vendor name, and timeout.
pub fn vendor_unreachable_response(vendor: &str, timeout_ms: u64) -> Response<ProxyBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "vendor_unreachable",
        vendor: Some(vendor.to_string()),
        message: None,
        timeout_ms: Some(timeout_ms),
    })
    .expect("ErrorResponse serialization should never fail");

    Response::builder()
        .status(http::StatusCode::BAD_GATEWAY)
        .header("content-type", "application/json")
        .body(full_body(body))
        .expect("Response builder with valid status should never fail")
}

/// Build a 403 Forbidden response when a policy blocks a request.
///
/// Response body varies based on `BlockResponseDetail`:
/// - `Detailed`: Includes policy_id, reason, and a human-readable message.
/// - `Opaque`: Just "Request blocked by policy" with no additional context.
pub fn policy_blocked_response(
    policy_id: &str,
    reason: Option<&str>,
    detail: BlockResponseDetail,
) -> Response<ProxyBody> {
    let body = match detail {
        BlockResponseDetail::Detailed => serde_json::to_vec(&PolicyBlockedResponse {
            error: "policy_blocked",
            policy_id: Some(policy_id.to_string()),
            reason: reason.map(|r| r.to_string()),
            message: Some(format!(
                "Request blocked by policy '{}'{}",
                policy_id,
                reason
                    .map(|r| format!(": {}", r))
                    .unwrap_or_default()
            )),
        }),
        BlockResponseDetail::Opaque => serde_json::to_vec(&PolicyBlockedResponse {
            error: "policy_blocked",
            policy_id: None,
            reason: None,
            message: Some("Request blocked by policy".to_string()),
        }),
    }
    .expect("PolicyBlockedResponse serialization should never fail");

    Response::builder()
        .status(http::StatusCode::FORBIDDEN)
        .header("content-type", "application/json")
        .body(full_body(body))
        .expect("Response builder with valid status should never fail")
}

/// Structured JSON body for policy-blocked responses.
#[derive(Serialize)]
struct PolicyBlockedResponse {
    error: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    policy_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Build a 503 Service Unavailable response for backpressure.
///
/// Returns a structured JSON body with `Retry-After: 1` header.
pub fn backpressure_response() -> Response<ProxyBody> {
    let body = serde_json::to_vec(&ErrorResponse {
        error: "service_overloaded",
        vendor: None,
        message: Some("Request queue is full. Retry after a brief delay.".to_string()),
        timeout_ms: None,
    })
    .expect("ErrorResponse serialization should never fail");

    Response::builder()
        .status(http::StatusCode::SERVICE_UNAVAILABLE)
        .header("content-type", "application/json")
        .header("retry-after", "1")
        .body(full_body(body))
        .expect("Response builder with valid status should never fail")
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;

    #[tokio::test]
    async fn test_vendor_blocked_response() {
        let resp = vendor_blocked_response("evil.ai.com");
        assert_eq!(resp.status(), http::StatusCode::FORBIDDEN);
        assert_eq!(
            resp.headers().get("content-type").unwrap(),
            "application/json"
        );

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "vendor_blocked");
        assert_eq!(json["vendor"], "evil.ai.com");
    }

    #[tokio::test]
    async fn test_vendor_unreachable_response() {
        let resp = vendor_unreachable_response("api.openai.com", 10_000);
        assert_eq!(resp.status(), http::StatusCode::BAD_GATEWAY);

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "vendor_unreachable");
        assert_eq!(json["vendor"], "api.openai.com");
        assert_eq!(json["timeout_ms"], 10_000);
    }

    #[tokio::test]
    async fn test_backpressure_response() {
        let resp = backpressure_response();
        assert_eq!(resp.status(), http::StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(resp.headers().get("retry-after").unwrap(), "1");

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "service_overloaded");
    }
}
