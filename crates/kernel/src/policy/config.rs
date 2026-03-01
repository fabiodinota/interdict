//! Policy configuration types for the Interdict kernel proxy.
//!
//! Each policy has its own configuration controlling fail-mode behavior,
//! block response detail level, redaction direction, and Layer 2 background
//! classification.

use serde::{Deserialize, Serialize};

use super::verdict::VerdictAction;

/// Behavior when a policy evaluation encounters an error (Wasm panic, model failure, etc.).
///
/// Defaults to `FailClosed` per PLCY-09: errors result in blocking.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailMode {
    /// Error → Block the request. Conservative, security-first default.
    #[default]
    FailClosed,
    /// Error → Allow the request. Use only for non-critical policies.
    FailOpen,
}

impl FailMode {
    /// Returns the default verdict action for this fail mode.
    ///
    /// - `FailClosed` → `Block`
    /// - `FailOpen` → `Allow`
    pub fn default_action(&self) -> VerdictAction {
        match self {
            Self::FailClosed => VerdictAction::Block,
            Self::FailOpen => VerdictAction::Allow,
        }
    }
}

/// Detail level for block responses sent to the client.
///
/// - `Detailed`: Includes policy_id, reason category, human-readable message.
/// - `Opaque`: Just "Request blocked by policy" with no details.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockResponseDetail {
    /// Include policy_id, reason, and human-readable message in block response.
    Detailed,
    /// Return only "Request blocked by policy" with no additional context.
    #[default]
    Opaque,
}

/// Which traffic direction(s) redaction applies to.
///
/// Defaults to `Both` — redaction on both outbound prompts and inbound responses.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RedactionDirection {
    /// Apply redaction to both outbound prompts and inbound responses.
    #[default]
    Both,
    /// Apply redaction only to outbound prompts.
    OutboundOnly,
    /// Apply redaction only to inbound responses.
    InboundOnly,
}

/// Configuration for a single policy in the evaluation pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    /// Unique identifier for this policy.
    pub id: String,
    /// Human-readable name for this policy.
    pub name: String,
    /// Path to the Rego source file for Layer 1 evaluation (optional).
    pub rego_source: Option<String>,
    /// Explicit Rego entrypoint rule path for distributed policies (optional).
    ///
    /// When present, `evaluate()` uses this as the Rego rule path instead of
    /// deriving it from `rego_source` via `rsplit('/')`. This is required for
    /// distributed policies where `rego_source` contains inline Rego code
    /// rather than a filesystem path.
    ///
    /// Example: `"data.interdict.policy.pol1.verdict"`
    #[serde(default)]
    pub entrypoint: Option<String>,
    /// Behavior on evaluation error (default: fail-closed per PLCY-09).
    #[serde(default)]
    pub fail_mode: FailMode,
    /// Detail level for block responses (default: opaque).
    #[serde(default)]
    pub block_response_detail: BlockResponseDetail,
    /// Which direction(s) redaction applies to (default: both).
    #[serde(default)]
    pub redaction_direction: RedactionDirection,
    /// Whether to run Layer 2 NLP in background when Layer 1 gives explicit verdict.
    #[serde(default = "default_background_l2")]
    pub background_l2: bool,
    /// Whether this policy is active.
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_background_l2() -> bool {
    true
}

fn default_enabled() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fail_mode_defaults_to_fail_closed() {
        assert_eq!(FailMode::default(), FailMode::FailClosed);
    }

    #[test]
    fn test_fail_mode_default_actions() {
        assert_eq!(FailMode::FailClosed.default_action(), VerdictAction::Block);
        assert_eq!(FailMode::FailOpen.default_action(), VerdictAction::Allow);
    }

    #[test]
    fn test_block_response_detail_defaults_to_opaque() {
        assert_eq!(BlockResponseDetail::default(), BlockResponseDetail::Opaque);
    }

    #[test]
    fn test_redaction_direction_defaults_to_both() {
        assert_eq!(RedactionDirection::default(), RedactionDirection::Both);
    }

    #[test]
    fn test_policy_config_serialization_roundtrip() {
        let config = PolicyConfig {
            id: "test-policy".to_string(),
            name: "Test Policy".to_string(),
            rego_source: Some("policies/test.rego".to_string()),
            entrypoint: Some("data.interdict.policy.test.verdict".to_string()),
            fail_mode: FailMode::FailClosed,
            block_response_detail: BlockResponseDetail::Detailed,
            redaction_direction: RedactionDirection::OutboundOnly,
            background_l2: false,
            enabled: true,
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: PolicyConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, "test-policy");
        assert_eq!(deserialized.fail_mode, FailMode::FailClosed);
        assert_eq!(
            deserialized.block_response_detail,
            BlockResponseDetail::Detailed
        );
        assert_eq!(
            deserialized.redaction_direction,
            RedactionDirection::OutboundOnly
        );
        assert!(!deserialized.background_l2);
        assert!(deserialized.enabled);
        assert_eq!(
            deserialized.entrypoint,
            Some("data.interdict.policy.test.verdict".to_string())
        );
    }

    #[test]
    fn test_policy_config_defaults_from_minimal_json() {
        let json = r#"{
            "id": "minimal",
            "name": "Minimal Policy",
            "rego_source": null
        }"#;

        let config: PolicyConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.id, "minimal");
        assert_eq!(config.fail_mode, FailMode::FailClosed);
        assert_eq!(config.block_response_detail, BlockResponseDetail::Opaque);
        assert_eq!(config.redaction_direction, RedactionDirection::Both);
        assert!(config.background_l2);
        assert!(config.enabled);
        assert!(config.entrypoint.is_none());
    }

    #[test]
    fn test_fail_mode_serde_names() {
        let fc: FailMode = serde_json::from_str(r#""fail_closed""#).unwrap();
        assert_eq!(fc, FailMode::FailClosed);

        let fo: FailMode = serde_json::from_str(r#""fail_open""#).unwrap();
        assert_eq!(fo, FailMode::FailOpen);
    }

    #[test]
    fn test_block_response_detail_serde_names() {
        let d: BlockResponseDetail = serde_json::from_str(r#""detailed""#).unwrap();
        assert_eq!(d, BlockResponseDetail::Detailed);

        let o: BlockResponseDetail = serde_json::from_str(r#""opaque""#).unwrap();
        assert_eq!(o, BlockResponseDetail::Opaque);
    }

    #[test]
    fn test_redaction_direction_serde_names() {
        let b: RedactionDirection = serde_json::from_str(r#""both""#).unwrap();
        assert_eq!(b, RedactionDirection::Both);

        let out: RedactionDirection = serde_json::from_str(r#""outbound_only""#).unwrap();
        assert_eq!(out, RedactionDirection::OutboundOnly);

        let inp: RedactionDirection = serde_json::from_str(r#""inbound_only""#).unwrap();
        assert_eq!(inp, RedactionDirection::InboundOnly);
    }
}
