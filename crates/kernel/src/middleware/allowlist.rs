//! Vendor allowlist middleware (deny-by-default).
//!
//! Implements a Tower Layer/Service that checks the target hostname against
//! an approved vendor list. Unlisted vendors are blocked with 403 Forbidden.
//!
//! Full Tower middleware implementation in Task 3.

use crate::config::AllowlistConfig;
use std::collections::HashSet;

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

    /// Check if a domain is on the approved allowlist.
    ///
    /// Uses exact string match -- no regex, no glob, no DNS resolution.
    pub fn is_allowed(&self, domain: &str) -> bool {
        self.allowed_domains.contains(domain)
    }
}
