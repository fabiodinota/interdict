//! Verdict types and merge logic for the policy evaluation pipeline.
//!
//! The verdict system implements most-restrictive-wins merging:
//! Block > Redact > Allow. Overlapping redactions are unioned additively.
//! Full verdict traces are generated for every request for audit purposes.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Hash matched text with SHA-256 to prevent PII from persisting in verdict structs.
pub fn hash_matched_text(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

/// Enforcement action that a policy can return.
///
/// Ordered by restrictiveness: Allow(0) < Redact(1) < Block(2).
/// Derive `Ord` enables `max()` for most-restrictive-wins merge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum VerdictAction {
    /// Pass the request/response through unmodified.
    Allow = 0,
    /// Modify content by redacting sensitive data, then pass through.
    Redact = 1,
    /// Reject the request entirely.
    Block = 2,
}

/// A single redaction to apply to content.
///
/// Replacement uses category-tagged placeholders (e.g., `[REDACTED:SSN]`)
/// so downstream consumers and auditors can see what type of content was removed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Redaction {
    /// Category of the redacted content (e.g., "SSN", "EMAIL", "API_KEY").
    pub category: String,
    /// Regex pattern that matched the content.
    pub pattern: String,
    /// SHA-256 hash of the matched text (prevents PII from persisting in structs).
    pub matched_text_hash: String,
    /// The replacement string (e.g., "[REDACTED:SSN]").
    pub replacement: String,
}

/// Verdict from a single policy evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyVerdict {
    /// Identifier of the policy that produced this verdict.
    pub policy_id: String,
    /// The enforcement action.
    pub action: VerdictAction,
    /// Redactions to apply (non-empty only when action == Redact).
    pub redactions: Vec<Redaction>,
    /// Human-readable reason for the verdict.
    pub reason: Option<String>,
}

/// Merged result of evaluating all matching policies for a single request.
///
/// Most-restrictive-wins: if any policy says Block, the merged action is Block.
/// Redactions from all policies are unioned additively.
/// Full list of individual policy verdicts is preserved for audit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MergedVerdict {
    /// The final enforcement action (most restrictive across all policies).
    pub final_action: VerdictAction,
    /// Union of all redactions from all policies.
    pub redactions: Vec<Redaction>,
    /// Individual verdicts from each matching policy (full audit trail).
    pub policy_verdicts: Vec<PolicyVerdict>,
}

impl MergedVerdict {
    /// Merge multiple policy verdicts into a single enforcement decision.
    ///
    /// - Takes the most restrictive action (Block > Redact > Allow).
    /// - Unions all redactions from all policies additively.
    /// - Preserves full individual verdicts for audit trail.
    /// - Empty input defaults to Allow with no redactions.
    pub fn merge(verdicts: Vec<PolicyVerdict>) -> Self {
        let final_action = verdicts
            .iter()
            .map(|v| v.action)
            .max()
            .unwrap_or(VerdictAction::Allow);

        let redactions: Vec<Redaction> = verdicts
            .iter()
            .flat_map(|v| v.redactions.iter().cloned())
            .collect();

        Self {
            final_action,
            redactions,
            policy_verdicts: verdicts,
        }
    }
}

/// Classification result from Layer 2 NLP classifier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClassificationResult {
    /// The predicted label (e.g., "allow", "block", "redact", "uncertain").
    pub label: String,
    /// Confidence score for the predicted label.
    pub confidence: f32,
    /// All output scores from the model.
    pub all_scores: Vec<(String, f32)>,
}

/// Human reviewer decision from Layer 3.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HumanDecision {
    /// The enforcement action decided by the reviewer.
    pub action: VerdictAction,
    /// Identifier of the reviewer who made the decision.
    pub reviewer_id: String,
    /// Reason provided by the reviewer.
    pub reason: String,
    /// When the decision was made.
    pub decided_at: chrono::DateTime<chrono::Utc>,
}

/// Full pipeline trace for a single request across all layers.
///
/// Generated for every request for audit purposes. Includes Layer 1
/// individual verdicts, optional Layer 2 classification, and optional
/// Layer 3 human decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerdictTrace {
    /// Request identifier (correlates with RequestContext).
    pub request_id: uuid::Uuid,
    /// The merged verdict that was enforced.
    pub merged_verdict: MergedVerdict,
    /// Individual Layer 1 policy results.
    pub layer1_results: Vec<PolicyVerdict>,
    /// Layer 2 NLP classification (if run).
    pub layer2_classification: Option<ClassificationResult>,
    /// Layer 3 human decision (if escalated).
    pub layer3_decision: Option<HumanDecision>,
    /// When this trace was generated.
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_verdict(policy_id: &str, action: VerdictAction) -> PolicyVerdict {
        PolicyVerdict {
            policy_id: policy_id.to_string(),
            action,
            redactions: vec![],
            reason: None,
        }
    }

    fn make_redact_verdict(policy_id: &str, redactions: Vec<Redaction>) -> PolicyVerdict {
        PolicyVerdict {
            policy_id: policy_id.to_string(),
            action: VerdictAction::Redact,
            redactions,
            reason: Some("redaction policy".to_string()),
        }
    }

    fn make_redaction(category: &str) -> Redaction {
        Redaction {
            category: category.to_string(),
            pattern: format!(r"\b{}\b", category),
            matched_text_hash: hash_matched_text(&format!("matched-{}", category)),
            replacement: format!("[REDACTED:{}]", category),
        }
    }

    #[test]
    fn test_merge_block_wins_over_redact_and_allow() {
        let verdicts = vec![
            make_verdict("policy-1", VerdictAction::Allow),
            make_verdict("policy-2", VerdictAction::Redact),
            make_verdict("policy-3", VerdictAction::Block),
        ];

        let merged = MergedVerdict::merge(verdicts);
        assert_eq!(merged.final_action, VerdictAction::Block);
        assert_eq!(merged.policy_verdicts.len(), 3);
    }

    #[test]
    fn test_merge_redact_wins_over_allow() {
        let verdicts = vec![
            make_verdict("policy-1", VerdictAction::Allow),
            make_verdict("policy-2", VerdictAction::Redact),
        ];

        let merged = MergedVerdict::merge(verdicts);
        assert_eq!(merged.final_action, VerdictAction::Redact);
        assert_eq!(merged.policy_verdicts.len(), 2);
    }

    #[test]
    fn test_merge_all_allow() {
        let verdicts = vec![
            make_verdict("policy-1", VerdictAction::Allow),
            make_verdict("policy-2", VerdictAction::Allow),
            make_verdict("policy-3", VerdictAction::Allow),
        ];

        let merged = MergedVerdict::merge(verdicts);
        assert_eq!(merged.final_action, VerdictAction::Allow);
        assert_eq!(merged.policy_verdicts.len(), 3);
    }

    #[test]
    fn test_merge_redactions_union() {
        let verdicts = vec![
            make_redact_verdict("policy-1", vec![make_redaction("SSN")]),
            make_redact_verdict("policy-2", vec![make_redaction("EMAIL")]),
        ];

        let merged = MergedVerdict::merge(verdicts);
        assert_eq!(merged.final_action, VerdictAction::Redact);
        assert_eq!(merged.redactions.len(), 2);
        assert_eq!(merged.redactions[0].category, "SSN");
        assert_eq!(merged.redactions[1].category, "EMAIL");
    }

    #[test]
    fn test_merge_single_verdict() {
        let verdicts = vec![make_verdict("policy-1", VerdictAction::Block)];

        let merged = MergedVerdict::merge(verdicts);
        assert_eq!(merged.final_action, VerdictAction::Block);
        assert_eq!(merged.policy_verdicts.len(), 1);
    }

    #[test]
    fn test_merge_empty_defaults_allow() {
        let merged = MergedVerdict::merge(vec![]);
        assert_eq!(merged.final_action, VerdictAction::Allow);
        assert!(merged.redactions.is_empty());
        assert!(merged.policy_verdicts.is_empty());
    }

    #[test]
    fn test_verdict_action_ordering() {
        assert!(VerdictAction::Allow < VerdictAction::Redact);
        assert!(VerdictAction::Redact < VerdictAction::Block);
        assert!(VerdictAction::Allow < VerdictAction::Block);
    }

    #[test]
    fn test_policy_verdict_serialization() {
        let verdict = make_redact_verdict("test-policy", vec![make_redaction("SSN")]);
        let json = serde_json::to_string(&verdict).unwrap();
        let deserialized: PolicyVerdict = serde_json::from_str(&json).unwrap();
        assert_eq!(verdict, deserialized);
    }

    #[test]
    fn test_merged_verdict_serialization() {
        let verdicts = vec![
            make_verdict("policy-1", VerdictAction::Allow),
            make_redact_verdict("policy-2", vec![make_redaction("EMAIL")]),
        ];
        let merged = MergedVerdict::merge(verdicts);

        let json = serde_json::to_string(&merged).unwrap();
        let deserialized: MergedVerdict = serde_json::from_str(&json).unwrap();
        assert_eq!(merged, deserialized);
    }

    #[test]
    fn test_redaction_serialization_contains_no_plaintext_pii() {
        let sensitive = "123-45-6789";
        let redaction = Redaction {
            category: "SSN".to_string(),
            pattern: r"\d{3}-\d{2}-\d{4}".to_string(),
            matched_text_hash: hash_matched_text(sensitive),
            replacement: "[REDACTED:SSN]".to_string(),
        };
        let json = serde_json::to_string(&redaction).unwrap();
        assert!(
            !json.contains("123-45-6789"),
            "JSON must not contain plaintext PII"
        );
        assert!(
            json.contains("matched_text_hash"),
            "JSON should contain the hash field"
        );
    }
}
