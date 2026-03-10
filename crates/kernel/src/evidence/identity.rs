//! Actor identity extraction for evidence attribution.
//!
//! Extracts identity metadata from incoming HTTP request headers so that
//! evidence rows are attributable to real actors rather than defaulting to
//! "anonymous"/"unknown".
//!
//! Header precedence (first non-empty wins):
//! - `X-Interdict-Actor-Id` / `X-Interdict-Department` / `X-Interdict-Model`
//! - mTLS client certificate subject (future)
//! - Falls back to `anonymous`/`unknown` only when no identity is available.

/// Identity metadata extracted from an incoming request.
///
/// Carried through the proxy → evidence pipeline so that every
/// `RawEvidenceEvent` contains real attribution data.
#[derive(Debug, Clone)]
pub struct ActorIdentity {
    /// Authenticated actor identifier (email, service account, etc.).
    /// `"anonymous"` only when no identity header or mTLS cert is present.
    pub actor_id: String,
    /// Organizational department of the actor.
    /// `"unknown"` only when no header is present.
    pub department: String,
    /// AI model being targeted (extracted from vendor-specific path or header).
    /// `"unknown"` when not determinable at CONNECT time.
    pub model: String,
}

impl ActorIdentity {
    /// Sentinel value indicating no identity was available.
    pub const ANONYMOUS: &'static str = "anonymous";
    /// Sentinel value indicating a field could not be determined.
    pub const UNKNOWN: &'static str = "unknown";

    /// Create an identity with all fields set to anonymous/unknown defaults.
    pub fn anonymous() -> Self {
        Self {
            actor_id: Self::ANONYMOUS.to_string(),
            department: Self::UNKNOWN.to_string(),
            model: Self::UNKNOWN.to_string(),
        }
    }

    /// Returns `true` if the actor was actually identified (not anonymous).
    pub fn is_identified(&self) -> bool {
        self.actor_id != Self::ANONYMOUS
    }

    /// Extract identity from HTTP request headers.
    ///
    /// Reads:
    /// - `X-Interdict-Actor-Id` → `actor_id`
    /// - `X-Interdict-Department` → `department`
    /// - `X-Interdict-Model` → `model`
    ///
    /// Any missing or empty header falls back to the anonymous/unknown default.
    pub fn from_headers(headers: &http::HeaderMap) -> Self {
        let actor_id = header_value(headers, "x-interdict-actor-id")
            .unwrap_or_else(|| Self::ANONYMOUS.to_string());
        let department = header_value(headers, "x-interdict-department")
            .unwrap_or_else(|| Self::UNKNOWN.to_string());
        let model =
            header_value(headers, "x-interdict-model").unwrap_or_else(|| Self::UNKNOWN.to_string());

        Self {
            actor_id,
            department,
            model,
        }
    }
}

/// Extract a non-empty ASCII header value, returning `None` if absent or empty.
fn header_value(headers: &http::HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;

    #[test]
    fn anonymous_by_default() {
        let identity = ActorIdentity::anonymous();
        assert_eq!(identity.actor_id, "anonymous");
        assert_eq!(identity.department, "unknown");
        assert_eq!(identity.model, "unknown");
        assert!(!identity.is_identified());
    }

    #[test]
    fn from_headers_extracts_all_fields() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-interdict-actor-id",
            "alice@corp.example".parse().unwrap(),
        );
        headers.insert("x-interdict-department", "legal".parse().unwrap());
        headers.insert("x-interdict-model", "gpt-4o".parse().unwrap());

        let identity = ActorIdentity::from_headers(&headers);
        assert_eq!(identity.actor_id, "alice@corp.example");
        assert_eq!(identity.department, "legal");
        assert_eq!(identity.model, "gpt-4o");
        assert!(identity.is_identified());
    }

    #[test]
    fn from_headers_partial_falls_back() {
        let mut headers = HeaderMap::new();
        headers.insert("x-interdict-actor-id", "bob@corp.example".parse().unwrap());
        // No department or model headers

        let identity = ActorIdentity::from_headers(&headers);
        assert_eq!(identity.actor_id, "bob@corp.example");
        assert_eq!(identity.department, "unknown");
        assert_eq!(identity.model, "unknown");
        assert!(identity.is_identified());
    }

    #[test]
    fn from_headers_empty_values_treated_as_absent() {
        let mut headers = HeaderMap::new();
        headers.insert("x-interdict-actor-id", "".parse().unwrap());

        let identity = ActorIdentity::from_headers(&headers);
        assert_eq!(identity.actor_id, "anonymous");
        assert!(!identity.is_identified());
    }

    #[test]
    fn from_headers_no_headers_gives_anonymous() {
        let headers = HeaderMap::new();
        let identity = ActorIdentity::from_headers(&headers);
        assert_eq!(identity.actor_id, "anonymous");
        assert_eq!(identity.department, "unknown");
        assert_eq!(identity.model, "unknown");
    }
}
