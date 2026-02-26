//! Vendor allowlist middleware (deny-by-default).
//!
//! Implements a Tower Layer/Service that checks the target hostname against
//! an approved vendor list. Unlisted vendors are blocked with 403 Forbidden
//! with a structured JSON error response.
//!
//! Domain matching is exact O(1) string match via `HashSet` -- no regex,
//! no glob, no DNS resolution in the hot path (per CONTEXT.md decisions).

use crate::config::AllowlistConfig;
use crate::error::{self, ProxyBody};
use http::{Method, Request, Response};
use hyper::body::Incoming;
use std::collections::HashSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tower::{Layer, Service};

/// Deny-by-default vendor allowlist.
///
/// Only domains explicitly listed are allowed through the proxy.
/// Domain matching is exact O(1) string match via `HashSet`.
pub struct VendorAllowlist {
    allowed_domains: HashSet<String>,
}

impl VendorAllowlist {
    /// Build a `VendorAllowlist` from configuration.
    pub fn from_config(config: &AllowlistConfig) -> Self {
        Self {
            allowed_domains: config.to_set(),
        }
    }

    /// Create a `VendorAllowlist` from a slice of domain strings.
    pub fn new(domains: &[&str]) -> Self {
        Self {
            allowed_domains: domains.iter().map(|s| s.to_string()).collect(),
        }
    }

    /// Check if a domain is on the approved allowlist.
    ///
    /// Uses exact string match -- no regex, no glob, no DNS resolution.
    pub fn is_allowed(&self, domain: &str) -> bool {
        self.allowed_domains.contains(domain)
    }
}

/// Tower `Layer` that wraps a service with vendor allowlist enforcement.
#[derive(Clone)]
pub struct AllowlistLayer {
    allowlist: Arc<VendorAllowlist>,
}

impl AllowlistLayer {
    /// Create a new `AllowlistLayer` with the given allowlist.
    pub fn new(allowlist: Arc<VendorAllowlist>) -> Self {
        Self { allowlist }
    }
}

impl<S> Layer<S> for AllowlistLayer {
    type Service = AllowlistService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        AllowlistService {
            inner,
            allowlist: self.allowlist.clone(),
        }
    }
}

/// Tower `Service` that enforces the vendor allowlist.
///
/// For CONNECT requests: extracts host from `req.uri().authority()`.
/// For direct HTTP requests: extracts host from URI or Host header.
/// If the host is not on the allowlist, returns 403 Forbidden immediately.
#[derive(Clone)]
pub struct AllowlistService<S> {
    inner: S,
    allowlist: Arc<VendorAllowlist>,
}

impl<S> Service<Request<Incoming>> for AllowlistService<S>
where
    S: Service<Request<Incoming>, Response = Response<ProxyBody>> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response<ProxyBody>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Incoming>) -> Self::Future {
        let allowlist = self.allowlist.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Extract host from request
            let host = extract_host(&req);

            match host {
                Some(ref h) if allowlist.is_allowed(h) => {
                    tracing::debug!(vendor = %h, "vendor allowed");
                    inner.call(req).await
                }
                Some(ref h) => {
                    tracing::warn!(vendor = %h, "vendor blocked by allowlist");
                    Ok(error::vendor_blocked_response(h))
                }
                None => {
                    tracing::warn!("request missing host information, blocking");
                    Ok(error::vendor_blocked_response("unknown"))
                }
            }
        })
    }
}

/// Extract the target host from a request.
///
/// For CONNECT: uses `req.uri().authority().host()`
/// For direct HTTP: uses URI host or falls back to Host header.
fn extract_host<B>(req: &Request<B>) -> Option<String> {
    if req.method() == Method::CONNECT {
        // CONNECT requests have authority in the URI
        req.uri()
            .authority()
            .map(|auth| auth.host().to_string())
    } else {
        // Direct HTTP: try URI host first, then Host header
        req.uri()
            .host()
            .map(|h| h.to_string())
            .or_else(|| {
                req.headers()
                    .get(http::header::HOST)
                    .and_then(|v| v.to_str().ok())
                    .map(|h| {
                        // Strip port if present
                        h.split(':').next().unwrap_or(h).to_string()
                    })
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allowlist_allows_configured_domain() {
        let allowlist = VendorAllowlist::new(&["api.openai.com"]);
        assert!(allowlist.is_allowed("api.openai.com"));
    }

    #[test]
    fn test_allowlist_blocks_unconfigured_domain() {
        let allowlist = VendorAllowlist::new(&["api.openai.com"]);
        assert!(!allowlist.is_allowed("evil.ai.com"));
    }

    #[test]
    fn test_empty_allowlist_blocks_everything() {
        let allowlist = VendorAllowlist::new(&[]);
        assert!(!allowlist.is_allowed("api.openai.com"));
        assert!(!allowlist.is_allowed("api.anthropic.com"));
    }

    #[test]
    fn test_exact_domain_matching() {
        let allowlist = VendorAllowlist::new(&["api.openai.com"]);
        // Subdomain does NOT match parent
        assert!(!allowlist.is_allowed("openai.com"));
        // Parent does NOT match subdomain
        assert!(!allowlist.is_allowed("sub.api.openai.com"));
        // Exact match only
        assert!(allowlist.is_allowed("api.openai.com"));
    }

    #[test]
    fn test_from_config() {
        let config = AllowlistConfig {
            vendors: vec![
                "api.openai.com".to_string(),
                "api.anthropic.com".to_string(),
            ],
        };
        let allowlist = VendorAllowlist::from_config(&config);
        assert!(allowlist.is_allowed("api.openai.com"));
        assert!(allowlist.is_allowed("api.anthropic.com"));
        assert!(!allowlist.is_allowed("evil.ai.com"));
    }

    // extract_host is generic over body type, so we test with ()
    #[test]
    fn test_extract_host_from_connect_request() {
        let req = Request::builder()
            .method(Method::CONNECT)
            .uri("api.openai.com:443")
            .body(())
            .unwrap();

        let host = extract_host(&req);
        assert_eq!(host, Some("api.openai.com".to_string()));
    }

    #[test]
    fn test_extract_host_from_direct_request() {
        let req = Request::builder()
            .method(Method::GET)
            .uri("https://api.openai.com/v1/chat")
            .body(())
            .unwrap();

        let host = extract_host(&req);
        assert_eq!(host, Some("api.openai.com".to_string()));
    }
}
