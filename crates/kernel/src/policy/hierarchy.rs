//! Three-level hierarchy resolver for organizational policy inheritance.
//!
//! Implements Organization -> Department -> Team hierarchy with
//! most-restrictive-wins conflict resolution. Policies at lower levels
//! can only tighten, never loosen, org-level protections.
//!
//! Users inherit from their team; no per-user overrides.
//! Vendor-specific scoping is supported at each hierarchy level.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::policy::config::PolicyConfig;

/// Hierarchy context identifying which org/dept/team to resolve for.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HierarchyConfig {
    /// Organization identifier (required).
    pub org_id: String,
    /// Department identifier (optional — if None, only org policies apply).
    pub dept_id: Option<String>,
    /// Team identifier (optional — if None, only org + dept policies apply).
    pub team_id: Option<String>,
}

/// Organizational scope attached to a policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyScope {
    /// Organization this policy belongs to.
    pub org_id: String,
    /// Department scope (empty = org-wide).
    pub dept_id: String,
    /// Team scope (empty = dept-wide or org-wide).
    pub team_id: String,
    /// Vendor-specific scoping (empty = all vendors).
    pub vendor_ids: Vec<String>,
}

/// A policy combined with its organizational scope.
#[derive(Debug, Clone)]
pub struct ScopedPolicy {
    /// The policy configuration.
    pub config: PolicyConfig,
    /// The organizational scope.
    pub scope: PolicyScope,
}

/// Resolves applicable policies across org/dept/team hierarchy levels.
///
/// Distributes policies into three buckets based on scope, then gathers
/// all applicable policies for a given context. Most-restrictive-wins
/// conflict resolution is handled downstream by `MergedVerdict::merge`.
pub struct HierarchyResolver {
    /// Policies that apply organization-wide (no dept/team scope).
    org_policies: Vec<ScopedPolicy>,
    /// Policies scoped to specific departments: dept_id -> policies.
    dept_policies: HashMap<String, Vec<ScopedPolicy>>,
    /// Policies scoped to specific teams: team_id -> policies.
    team_policies: HashMap<String, Vec<ScopedPolicy>>,
}

impl HierarchyResolver {
    /// Create a new resolver by distributing policies into hierarchy buckets.
    ///
    /// Policies are classified based on their scope:
    /// - No dept_id and no team_id -> org-level
    /// - dept_id set but no team_id -> dept-level
    /// - team_id set -> team-level
    pub fn new(policies: Vec<ScopedPolicy>) -> Self {
        let mut org = Vec::new();
        let mut dept: HashMap<String, Vec<ScopedPolicy>> = HashMap::new();
        let mut team: HashMap<String, Vec<ScopedPolicy>> = HashMap::new();

        for policy in policies {
            if !policy.scope.team_id.is_empty() {
                team.entry(policy.scope.team_id.clone())
                    .or_default()
                    .push(policy);
            } else if !policy.scope.dept_id.is_empty() {
                dept.entry(policy.scope.dept_id.clone())
                    .or_default()
                    .push(policy);
            } else {
                org.push(policy);
            }
        }

        Self {
            org_policies: org,
            dept_policies: dept,
            team_policies: team,
        }
    }

    /// Gather all applicable policies for the given hierarchy context and vendor.
    ///
    /// Returns policies from all matching hierarchy levels:
    /// 1. Org-level policies (always included)
    /// 2. Dept-level policies (if dept_id matches)
    /// 3. Team-level policies (if team_id matches)
    ///
    /// At each level, policies are filtered by vendor if vendor_ids is non-empty.
    /// Most-restrictive-wins is handled downstream by `MergedVerdict::merge`.
    pub fn resolve(&self, ctx: &HierarchyConfig, vendor: &str) -> Vec<PolicyConfig> {
        let mut result = Vec::new();

        // Level 1: Org-wide policies
        for sp in &self.org_policies {
            if Self::matches_vendor(sp, vendor) {
                result.push(sp.config.clone());
            }
        }

        // Level 2: Department policies
        if let Some(dept_id) = &ctx.dept_id
            && let Some(dept_policies) = self.dept_policies.get(dept_id)
        {
            for sp in dept_policies {
                if Self::matches_vendor(sp, vendor) {
                    result.push(sp.config.clone());
                }
            }
        }

        // Level 3: Team policies
        if let Some(team_id) = &ctx.team_id
            && let Some(team_policies) = self.team_policies.get(team_id)
        {
            for sp in team_policies {
                if Self::matches_vendor(sp, vendor) {
                    result.push(sp.config.clone());
                }
            }
        }

        result
    }

    /// Check if a scoped policy applies to the given vendor.
    /// Empty vendor_ids means the policy applies to all vendors.
    fn matches_vendor(sp: &ScopedPolicy, vendor: &str) -> bool {
        sp.scope.vendor_ids.is_empty() || sp.scope.vendor_ids.iter().any(|v| v == vendor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::config::{BlockResponseDetail, FailMode, RedactionDirection};
    use crate::policy::verdict::{MergedVerdict, PolicyVerdict, VerdictAction};

    fn make_policy(id: &str, name: &str) -> PolicyConfig {
        PolicyConfig {
            id: id.to_string(),
            name: name.to_string(),
            rego_source: Some(format!("policies/{}.rego", id)),
            entrypoint: None,
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Opaque,
            redaction_direction: RedactionDirection::Both,
            background_l2: false,
            enabled: true,
        }
    }

    fn make_scoped(
        id: &str,
        name: &str,
        org: &str,
        dept: &str,
        team: &str,
        vendors: Vec<&str>,
    ) -> ScopedPolicy {
        ScopedPolicy {
            config: make_policy(id, name),
            scope: PolicyScope {
                org_id: org.to_string(),
                dept_id: dept.to_string(),
                team_id: team.to_string(),
                vendor_ids: vendors.into_iter().map(|s| s.to_string()).collect(),
            },
        }
    }

    #[test]
    fn test_org_only_resolution() {
        let resolver = HierarchyResolver::new(vec![make_scoped(
            "org-block",
            "Org Block Policy",
            "acme",
            "",
            "",
            vec![],
        )]);

        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: None,
            team_id: None,
        };

        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 1);
        assert_eq!(policies[0].id, "org-block");
    }

    #[test]
    fn test_org_plus_dept_resolution() {
        let resolver = HierarchyResolver::new(vec![
            make_scoped("org-policy", "Org Policy", "acme", "", "", vec![]),
            make_scoped(
                "dept-policy",
                "Dept Policy",
                "acme",
                "engineering",
                "",
                vec![],
            ),
        ]);

        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: Some("engineering".to_string()),
            team_id: None,
        };

        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 2);

        let ids: Vec<&str> = policies.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"org-policy"));
        assert!(ids.contains(&"dept-policy"));
    }

    #[test]
    fn test_org_plus_dept_plus_team_resolution() {
        let resolver = HierarchyResolver::new(vec![
            make_scoped("org-policy", "Org Policy", "acme", "", "", vec![]),
            make_scoped(
                "dept-policy",
                "Dept Policy",
                "acme",
                "engineering",
                "",
                vec![],
            ),
            make_scoped(
                "team-policy",
                "Team Policy",
                "acme",
                "engineering",
                "ml-team",
                vec![],
            ),
        ]);

        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: Some("engineering".to_string()),
            team_id: Some("ml-team".to_string()),
        };

        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 3);
    }

    #[test]
    fn test_empty_dept_team_returns_org_only() {
        let resolver = HierarchyResolver::new(vec![
            make_scoped("org-policy", "Org Policy", "acme", "", "", vec![]),
            make_scoped(
                "dept-policy",
                "Dept Policy",
                "acme",
                "engineering",
                "",
                vec![],
            ),
            make_scoped(
                "team-policy",
                "Team Policy",
                "acme",
                "engineering",
                "ml-team",
                vec![],
            ),
        ]);

        // No dept or team in context
        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: None,
            team_id: None,
        };

        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 1);
        assert_eq!(policies[0].id, "org-policy");
    }

    #[test]
    fn test_vendor_filtering() {
        let resolver = HierarchyResolver::new(vec![
            make_scoped("all-vendors", "All Vendors", "acme", "", "", vec![]),
            make_scoped(
                "openai-only",
                "OpenAI Only",
                "acme",
                "",
                "",
                vec!["api.openai.com"],
            ),
            make_scoped(
                "anthropic-only",
                "Anthropic Only",
                "acme",
                "",
                "",
                vec!["api.anthropic.com"],
            ),
        ]);

        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: None,
            team_id: None,
        };

        // OpenAI vendor
        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 2);
        let ids: Vec<&str> = policies.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"all-vendors"));
        assert!(ids.contains(&"openai-only"));
        assert!(!ids.contains(&"anthropic-only"));

        // Anthropic vendor
        let policies = resolver.resolve(&ctx, "api.anthropic.com");
        assert_eq!(policies.len(), 2);
        let ids: Vec<&str> = policies.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"all-vendors"));
        assert!(ids.contains(&"anthropic-only"));
    }

    #[test]
    fn test_most_restrictive_wins_via_merged_verdict() {
        // Org policy: Block for vendor
        // Dept policy: Allow
        // Result should be Block (most-restrictive-wins via MergedVerdict::merge)
        let org_verdict = PolicyVerdict {
            policy_id: "org-block".to_string(),
            action: VerdictAction::Block,
            redactions: vec![],
            reason: Some("org blocks this".to_string()),
        };
        let dept_verdict = PolicyVerdict {
            policy_id: "dept-allow".to_string(),
            action: VerdictAction::Allow,
            redactions: vec![],
            reason: Some("dept allows this".to_string()),
        };

        let merged = MergedVerdict::merge(vec![org_verdict, dept_verdict]);
        assert_eq!(merged.final_action, VerdictAction::Block);
    }

    #[test]
    fn test_unmatched_dept_ignored() {
        let resolver = HierarchyResolver::new(vec![
            make_scoped("org-policy", "Org Policy", "acme", "", "", vec![]),
            make_scoped("dept-policy", "HR Dept Policy", "acme", "hr", "", vec![]),
        ]);

        let ctx = HierarchyConfig {
            org_id: "acme".to_string(),
            dept_id: Some("engineering".to_string()), // not HR
            team_id: None,
        };

        let policies = resolver.resolve(&ctx, "api.openai.com");
        assert_eq!(policies.len(), 1);
        assert_eq!(policies[0].id, "org-policy");
    }
}
