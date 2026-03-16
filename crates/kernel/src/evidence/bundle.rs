use chrono::{DateTime, Utc};
use prost_types::Timestamp;
use uuid::Uuid;

use super::proto::EvidenceBundle;

#[derive(Debug, Clone)]
pub struct RawEvidenceEvent {
    pub timestamp: DateTime<Utc>,
    pub actor_identity: String,
    pub department: String,
    pub vendor: String,
    pub model: String,
    pub prompt_hash: String,
    pub response_hash: String,
    pub prompt_text: Option<String>,
    pub response_text: Option<String>,
    pub policy_action: String,
    pub policy_rules: Vec<String>,
    pub token_count: u32,
    pub enforcement_latency_us: u64,
}

pub fn to_proto_bundle(event: &RawEvidenceEvent, kernel_id: &str) -> EvidenceBundle {
    EvidenceBundle {
        bundle_id: Uuid::new_v4().to_string(),
        kernel_id: kernel_id.to_string(),
        timestamp: Some(to_proto_timestamp(event.timestamp)),
        actor_identity: event.actor_identity.clone(),
        department: event.department.clone(),
        vendor: event.vendor.clone(),
        model: event.model.clone(),
        prompt_hash: event.prompt_hash.clone(),
        response_hash: event.response_hash.clone(),
        #[allow(deprecated)] // Intentionally used for backward compat; will be removed in v2.0
        prompt_text: event.prompt_text.clone().unwrap_or_default(),
        #[allow(deprecated)] // Intentionally used for backward compat; will be removed in v2.0
        response_text: event.response_text.clone().unwrap_or_default(),
        policy_action: event.policy_action.clone(),
        policy_rules_json: serde_json::to_string(&event.policy_rules)
            .unwrap_or_else(|_| "[]".to_string()),
        token_count: event.token_count,
        enforcement_latency_us: event.enforcement_latency_us,
        chain_hash: Vec::new(),
        previous_hash: Vec::new(),
        sequence_number: 0,
        signature: Vec::new(),
        signing_key_id: String::new(),
        dev_signed: false,
        schema_version: 1,
    }
}

fn to_proto_timestamp(ts: DateTime<Utc>) -> Timestamp {
    Timestamp {
        seconds: ts.timestamp(),
        nanos: i32::try_from(ts.timestamp_subsec_nanos())
            .expect("subsec_nanos 0..999_999_999 fits i32"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(deprecated)] // Tests backward-compat fields scheduled for removal in v2.0
    fn raw_event_to_proto_preserves_fields() {
        let event = RawEvidenceEvent {
            timestamp: Utc::now(),
            actor_identity: "alice@corp.example".to_string(),
            department: "legal".to_string(),
            vendor: "api.openai.com".to_string(),
            model: "gpt-4o".to_string(),
            prompt_hash: "prompt-hash".to_string(),
            response_hash: "response-hash".to_string(),
            prompt_text: Some("prompt".to_string()),
            response_text: Some("response".to_string()),
            policy_action: "block".to_string(),
            policy_rules: vec!["policy-a".to_string(), "policy-b".to_string()],
            token_count: 42,
            enforcement_latency_us: 1234,
        };

        let proto = to_proto_bundle(&event, "kernel-1");

        assert_eq!(proto.kernel_id, "kernel-1");
        assert_eq!(proto.actor_identity, event.actor_identity);
        assert_eq!(proto.department, event.department);
        assert_eq!(proto.vendor, event.vendor);
        assert_eq!(proto.model, event.model);
        assert_eq!(proto.prompt_hash, event.prompt_hash);
        assert_eq!(proto.response_hash, event.response_hash);
        assert_eq!(proto.prompt_text, "prompt");
        assert_eq!(proto.response_text, "response");
        assert_eq!(proto.policy_action, "block");
        assert_eq!(proto.policy_rules_json, r#"["policy-a","policy-b"]"#);
        assert_eq!(proto.token_count, 42);
        assert_eq!(proto.enforcement_latency_us, 1234);
        assert!(proto.timestamp.is_some());
    }
}
