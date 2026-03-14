//! Structured error types for the Interdict kernel proxy.
//!
//! All errors use `thiserror` for derive-based definitions and provide
//! structured JSON error responses for client-facing errors.

use bytes::Bytes;
use http::header::{CONTENT_TYPE, RETRY_AFTER};
use http::{HeaderValue, Response, StatusCode};
use http_body_util::BodyExt;
use http_body_util::Full;
use http_body_util::combinators::BoxBody;
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

fn response_with_json_body(status: StatusCode, body: Vec<u8>) -> Response<ProxyBody> {
    let mut response = Response::new(full_body(body));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

pub(crate) fn json_response<T: Serialize>(
    status: StatusCode,
    payload: &T,
    fallback_body: &'static str,
) -> Response<ProxyBody> {
    match serde_json::to_vec(payload) {
        Ok(body) => response_with_json_body(status, body),
        Err(error) => {
            tracing::error!(error = %error, "failed to serialize JSON error response");
            response_with_json_body(status, fallback_body.as_bytes().to_vec())
        }
    }
}

pub(crate) fn json_response_with_retry_after<T: Serialize>(
    status: StatusCode,
    payload: &T,
    fallback_body: &'static str,
    retry_after: &'static str,
) -> Response<ProxyBody> {
    let mut response = json_response(status, payload, fallback_body);
    response
        .headers_mut()
        .insert(RETRY_AFTER, HeaderValue::from_static(retry_after));
    response
}

/// Build a 403 Forbidden response for blocked vendors.
///
/// Returns a structured JSON body with error type and vendor name.
pub fn vendor_blocked_response(vendor: &str) -> Response<ProxyBody> {
    json_response(
        StatusCode::FORBIDDEN,
        &ErrorResponse {
            error: "vendor_blocked",
            vendor: Some(vendor.to_string()),
            message: Some(format!(
                "Vendor '{}' is not on the approved allowlist",
                vendor
            )),
            timeout_ms: None,
        },
        r#"{"error":"vendor_blocked","message":"Vendor is not on the approved allowlist"}"#,
    )
}

/// Build a 502 Bad Gateway response for unreachable vendors.
///
/// Returns a structured JSON body with error type, vendor name, and timeout.
pub fn vendor_unreachable_response(vendor: &str, timeout_ms: u64) -> Response<ProxyBody> {
    json_response(
        StatusCode::BAD_GATEWAY,
        &ErrorResponse {
            error: "vendor_unreachable",
            vendor: Some(vendor.to_string()),
            message: None,
            timeout_ms: Some(timeout_ms),
        },
        r#"{"error":"vendor_unreachable"}"#,
    )
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
    let payload = match detail {
        BlockResponseDetail::Detailed => PolicyBlockedResponse {
            error: "policy_blocked",
            policy_id: Some(policy_id.to_string()),
            reason: reason.map(|r| r.to_string()),
            message: Some(format!(
                "Request blocked by policy '{}'{}",
                policy_id,
                reason.map(|r| format!(": {}", r)).unwrap_or_default()
            )),
        },
        BlockResponseDetail::Opaque => PolicyBlockedResponse {
            error: "policy_blocked",
            policy_id: None,
            reason: None,
            message: Some("Request blocked by policy".to_string()),
        },
    };

    json_response(
        StatusCode::FORBIDDEN,
        &payload,
        r#"{"error":"policy_blocked","message":"Request blocked by policy"}"#,
    )
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
    json_response_with_retry_after(
        StatusCode::SERVICE_UNAVAILABLE,
        &ErrorResponse {
            error: "service_overloaded",
            vendor: None,
            message: Some("Request queue is full. Retry after a brief delay.".to_string()),
            timeout_ms: None,
        },
        r#"{"error":"service_overloaded","message":"Request queue is full. Retry after a brief delay."}"#,
        "1",
    )
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

    #[tokio::test]
    async fn test_policy_blocked_response_opaque() {
        use crate::policy::config::BlockResponseDetail;

        let resp = policy_blocked_response(
            "pol-42",
            Some("secret detected"),
            BlockResponseDetail::Opaque,
        );
        assert_eq!(resp.status(), http::StatusCode::FORBIDDEN);
        assert_eq!(
            resp.headers().get("content-type").unwrap(),
            "application/json"
        );

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "policy_blocked");
        // Opaque mode must NOT include policy_id or reason
        assert!(
            json.get("policy_id").is_none(),
            "opaque should omit policy_id"
        );
        assert!(json.get("reason").is_none(), "opaque should omit reason");
        assert_eq!(json["message"], "Request blocked by policy");
    }

    #[tokio::test]
    async fn test_policy_blocked_response_detailed() {
        use crate::policy::config::BlockResponseDetail;

        let resp = policy_blocked_response(
            "pol-42",
            Some("secret detected"),
            BlockResponseDetail::Detailed,
        );
        assert_eq!(resp.status(), http::StatusCode::FORBIDDEN);

        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["error"], "policy_blocked");
        assert_eq!(json["policy_id"], "pol-42");
        assert_eq!(json["reason"], "secret detected");
        // Message should contain both the policy id and reason
        let msg = json["message"].as_str().unwrap();
        assert!(msg.contains("pol-42"), "message should mention policy id");
        assert!(
            msg.contains("secret detected"),
            "message should mention reason"
        );
    }

    #[tokio::test]
    async fn test_policy_blocked_response_detailed_no_reason() {
        use crate::policy::config::BlockResponseDetail;

        let resp = policy_blocked_response("pol-99", None, BlockResponseDetail::Detailed);
        let body_bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["policy_id"], "pol-99");
        assert!(
            json.get("reason").is_none(),
            "no reason was provided so it should be absent"
        );
    }

    #[test]
    fn test_proxy_error_config_display() {
        let err = ProxyError::Config("bad toml".to_string());
        let display = format!("{}", err);
        assert!(display.contains("config error"), "display: {display}");
        assert!(display.contains("bad toml"), "display: {display}");
    }

    #[test]
    fn test_proxy_error_tls_display() {
        // Create a TLS error via the From<rustls::Error> impl
        let tls_err = rustls::Error::General("test tls failure".to_string());
        let err = ProxyError::Tls(tls_err);
        let display = format!("{}", err);
        assert!(display.contains("TLS error"), "display: {display}");
        assert!(display.contains("test tls failure"), "display: {display}");
    }

    #[test]
    fn test_proxy_error_display_all_variants() {
        // MissingAuthority
        let e = ProxyError::MissingAuthority;
        assert_eq!(format!("{e}"), "missing authority in CONNECT request");

        // VendorBlocked
        let e = ProxyError::VendorBlocked("evil.ai".to_string());
        assert!(format!("{e}").contains("evil.ai"));

        // BackpressureFull
        let e = ProxyError::BackpressureFull;
        assert_eq!(format!("{e}"), "request queue full");

        // PoolExhausted
        let e = ProxyError::PoolExhausted("openai.com".to_string());
        let d = format!("{e}");
        assert!(d.contains("connection pool exhausted"));
        assert!(d.contains("openai.com"));

        // StreamTimeout
        let e = ProxyError::StreamTimeout(5000);
        assert!(format!("{e}").contains("5000"));

        // PolicyEvaluation
        let e = ProxyError::PolicyEvaluation("rego panic".to_string());
        assert!(format!("{e}").contains("rego panic"));

        // PolicyBlocked
        let e = ProxyError::PolicyBlocked {
            policy_id: "p1".to_string(),
            reason: Some("bad".to_string()),
            detail: crate::policy::config::BlockResponseDetail::Opaque,
        };
        assert!(format!("{e}").contains("p1"));
    }
}
