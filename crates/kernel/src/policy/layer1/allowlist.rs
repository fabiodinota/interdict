//! Vendor allowlist as a Layer 1 policy verdict.
//!
//! Refactored from Phase 1's standalone middleware into a policy that returns
//! a `PolicyVerdict`. The vendor allowlist check is now part of the policy
//! pipeline, producing Block/Allow verdicts that appear in the audit trail.
//!
//! **Dual-check design:** The original `AllowlistLayer` middleware (in
//! `middleware/allowlist.rs`) is kept as a fast-path that runs BEFORE TLS
//! tunnel establishment — avoiding the cost of TLS termination for blocked
//! vendors. This policy check runs INSIDE the policy pipeline so the verdict
//! appears in the audit trail. Both paths use the same underlying `VendorAllowlist`
//! domain type.

use crate::middleware::allowlist::VendorAllowlist;
use crate::policy::verdict::{PolicyVerdict, VerdictAction};
use crate::policy::RequestContext;
use std::sync::Arc;

/// Vendor allowlist as a Layer 1 policy.
///
/// Wraps the existing `VendorAllowlist` from `middleware::allowlist` to produce
/// policy verdicts instead of raw HTTP responses. Reuses the same domain HashSet
/// — no duplication.
pub struct VendorAllowlistPolicy {
    allowlist: Arc<VendorAllowlist>,
}

impl VendorAllowlistPolicy {
    /// Create a new `VendorAllowlistPolicy` wrapping an existing `VendorAllowlist`.
    pub fn new(allowlist: Arc<VendorAllowlist>) -> Self {
        Self { allowlist }
    }

    /// Evaluate the vendor allowlist policy against a request context.
    ///
    /// - If `ctx.vendor` is in the allowed set, returns `Allow`.
    /// - If `ctx.vendor` is NOT in the allowed set, returns `Block` with reason.
    pub fn evaluate(&self, ctx: &RequestContext) -> PolicyVerdict {
        if self.allowlist.is_allowed(&ctx.vendor) {
            PolicyVerdict {
                policy_id: "builtin:vendor_allowlist".to_string(),
                action: VerdictAction::Allow,
                redactions: vec![],
                reason: None,
            }
        } else {
            PolicyVerdict {
                policy_id: "builtin:vendor_allowlist".to_string(),
                action: VerdictAction::Block,
                redactions: vec![],
                reason: Some("Vendor not on approved allowlist".to_string()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::Direction;

    fn make_ctx(vendor: &str) -> RequestContext {
        RequestContext {
            request_id: uuid::Uuid::new_v4(),
            vendor: vendor.to_string(),
            method: "POST".to_string(),
            path: "/v1/chat/completions".to_string(),
            content_type: Some("application/json".to_string()),
            content: None,
            direction: Direction::Outbound,
        }
    }

    #[test]
    fn test_allowlist_policy_allows_approved_vendor() {
        let allowlist = Arc::new(VendorAllowlist::new(&[
            "api.openai.com",
            "api.anthropic.com",
        ]));
        let policy = VendorAllowlistPolicy::new(allowlist);

        let verdict = policy.evaluate(&make_ctx("api.openai.com"));
        assert_eq!(verdict.action, VerdictAction::Allow);
        assert!(verdict.reason.is_none());
        assert!(verdict.redactions.is_empty());
    }

    #[test]
    fn test_allowlist_policy_blocks_unapproved_vendor() {
        let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
        let policy = VendorAllowlistPolicy::new(allowlist);

        let verdict = policy.evaluate(&make_ctx("evil-ai.com"));
        assert_eq!(verdict.action, VerdictAction::Block);
        assert_eq!(
            verdict.reason,
            Some("Vendor not on approved allowlist".to_string())
        );
        assert!(verdict.redactions.is_empty());
    }

    #[test]
    fn test_allowlist_policy_id_is_builtin() {
        let allowlist = Arc::new(VendorAllowlist::new(&["api.openai.com"]));
        let policy = VendorAllowlistPolicy::new(allowlist);

        // Test with allowed vendor
        let verdict_allow = policy.evaluate(&make_ctx("api.openai.com"));
        assert!(verdict_allow.policy_id.starts_with("builtin:"));
        assert_eq!(verdict_allow.policy_id, "builtin:vendor_allowlist");

        // Test with blocked vendor
        let verdict_block = policy.evaluate(&make_ctx("evil-ai.com"));
        assert!(verdict_block.policy_id.starts_with("builtin:"));
        assert_eq!(verdict_block.policy_id, "builtin:vendor_allowlist");
    }
}
