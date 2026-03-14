//! Proto serialization roundtrip tests for policy distribution messages.
//!
//! Validates that all protobuf messages in the policy distribution API can
//! be serialized (encoded) and deserialized (decoded) without data loss.

use prost::Message;

use kernel::policy::distribution::proto;

// ── SubscribeResponse roundtrip ─────────────────────────────────────

#[test]
fn test_subscribe_response_with_policies_roundtrip() {
    let original = proto::SubscribeResponse {
        version: 42,
        r#type: 1, // FULL_SNAPSHOT
        policies: vec![
            proto::PolicyEntry {
                policy_id: "policy-alpha".to_string(),
                name: "Alpha Policy".to_string(),
                version: 3,
                wasm_bytes: vec![0x00, 0x61, 0x73, 0x6d], // Wasm magic bytes
                wasm_hash: "abc123def456".to_string(),
                rego_source:
                    "package alpha\nimport rego.v1\ndefault verdict := {\"action\": \"allow\"}\n"
                        .to_string(),
                entrypoint: "data.interdict.policy.alpha.verdict".to_string(),
                scope: Some(proto::PolicyScope {
                    org_id: "org-1".to_string(),
                    dept_id: "engineering".to_string(),
                    team_id: "platform".to_string(),
                    vendor_ids: vec![
                        "api.openai.com".to_string(),
                        "api.anthropic.com".to_string(),
                    ],
                }),
                fail_mode: 1, // FAIL_CLOSED
            },
            proto::PolicyEntry {
                policy_id: "policy-beta".to_string(),
                name: "Beta Policy".to_string(),
                version: 1,
                wasm_bytes: vec![],
                wasm_hash: String::new(),
                rego_source:
                    "package beta\nimport rego.v1\ndefault verdict := {\"action\": \"block\"}\n"
                        .to_string(),
                entrypoint: "data.interdict.policy.beta.verdict".to_string(),
                scope: Some(proto::PolicyScope {
                    org_id: "org-1".to_string(),
                    dept_id: String::new(),
                    team_id: String::new(),
                    vendor_ids: vec![],
                }),
                fail_mode: 2, // FAIL_OPEN
            },
        ],
        removed_policy_ids: vec!["old-policy-1".to_string(), "old-policy-2".to_string()],
        signature: vec![0xDE, 0xAD, 0xBE, 0xEF; 16], // 64 bytes
        signing_key_id: "key-rotation-2024".to_string(),
    };

    // Encode
    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    assert!(!buf.is_empty(), "encoded buffer should not be empty");

    // Decode
    let decoded = proto::SubscribeResponse::decode(buf.as_slice()).expect("decode should succeed");

    // Verify all fields match
    assert_eq!(decoded.version, original.version);
    assert_eq!(decoded.r#type, original.r#type);
    assert_eq!(decoded.policies.len(), original.policies.len());
    assert_eq!(decoded.removed_policy_ids, original.removed_policy_ids);
    assert_eq!(decoded.signature, original.signature);
    assert_eq!(decoded.signing_key_id, original.signing_key_id);

    // Verify first policy entry fields
    let dec_pol = &decoded.policies[0];
    let orig_pol = &original.policies[0];
    assert_eq!(dec_pol.policy_id, orig_pol.policy_id);
    assert_eq!(dec_pol.name, orig_pol.name);
    assert_eq!(dec_pol.version, orig_pol.version);
    assert_eq!(dec_pol.wasm_bytes, orig_pol.wasm_bytes);
    assert_eq!(dec_pol.wasm_hash, orig_pol.wasm_hash);
    assert_eq!(dec_pol.rego_source, orig_pol.rego_source);
    assert_eq!(dec_pol.entrypoint, orig_pol.entrypoint);
    assert_eq!(dec_pol.fail_mode, orig_pol.fail_mode);

    // Verify scope on first policy
    let dec_scope = dec_pol.scope.as_ref().expect("scope should be present");
    let orig_scope = orig_pol.scope.as_ref().unwrap();
    assert_eq!(dec_scope.org_id, orig_scope.org_id);
    assert_eq!(dec_scope.dept_id, orig_scope.dept_id);
    assert_eq!(dec_scope.team_id, orig_scope.team_id);
    assert_eq!(dec_scope.vendor_ids, orig_scope.vendor_ids);

    // Verify second policy
    assert_eq!(decoded.policies[1].policy_id, "policy-beta");
    assert_eq!(decoded.policies[1].fail_mode, 2);
}

// ── PolicyEntry with wasm_bytes + rego_source roundtrip ─────────────

#[test]
fn test_policy_entry_with_wasm_and_rego_roundtrip() {
    let wasm_payload: Vec<u8> = (0u8..=255).collect(); // 256 bytes of varied data
    let rego_source = r#"package interdict.policy.dual
import rego.v1
default verdict := {"action": "allow"}
verdict := {"action": "block", "reason": "dual_policy"} if {
    input.vendor == "risky.com"
}
"#
    .to_string();

    let original = proto::PolicyEntry {
        policy_id: "dual-engine-policy".to_string(),
        name: "Dual Engine Policy".to_string(),
        version: 7,
        wasm_bytes: wasm_payload.clone(),
        wasm_hash: "sha256-of-wasm-bytes".to_string(),
        rego_source: rego_source.clone(),
        entrypoint: "data.interdict.policy.dual.verdict".to_string(),
        scope: Some(proto::PolicyScope {
            org_id: "megacorp".to_string(),
            dept_id: "security".to_string(),
            team_id: "red-team".to_string(),
            vendor_ids: vec!["risky.com".to_string()],
        }),
        fail_mode: 1,
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");

    let decoded = proto::PolicyEntry::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.policy_id, original.policy_id);
    assert_eq!(decoded.name, original.name);
    assert_eq!(decoded.version, original.version);
    assert_eq!(decoded.wasm_bytes, wasm_payload);
    assert_eq!(decoded.wasm_hash, original.wasm_hash);
    assert_eq!(decoded.rego_source, rego_source);
    assert_eq!(decoded.entrypoint, original.entrypoint);
    assert_eq!(decoded.fail_mode, original.fail_mode);

    let scope = decoded.scope.expect("scope should survive roundtrip");
    assert_eq!(scope.org_id, "megacorp");
    assert_eq!(scope.dept_id, "security");
    assert_eq!(scope.team_id, "red-team");
    assert_eq!(scope.vendor_ids, vec!["risky.com"]);
}

// ── AcknowledgeRequest roundtrip ────────────────────────────────────

#[test]
fn test_acknowledge_request_accepted_roundtrip() {
    let original = proto::AcknowledgeRequest {
        kernel_id: "kernel-node-42".to_string(),
        version: 100,
        accepted: true,
        error_message: String::new(),
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::AcknowledgeRequest::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.kernel_id, original.kernel_id);
    assert_eq!(decoded.version, original.version);
    assert_eq!(decoded.accepted, true);
    assert!(decoded.error_message.is_empty());
}

#[test]
fn test_acknowledge_request_nack_roundtrip() {
    let original = proto::AcknowledgeRequest {
        kernel_id: "kernel-node-7".to_string(),
        version: 55,
        accepted: false,
        error_message: "Rego compilation failed: syntax error at line 3".to_string(),
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::AcknowledgeRequest::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.kernel_id, "kernel-node-7");
    assert_eq!(decoded.version, 55);
    assert_eq!(decoded.accepted, false);
    assert_eq!(
        decoded.error_message,
        "Rego compilation failed: syntax error at line 3"
    );
}

// ── SubscribeRequest roundtrip ──────────────────────────────────────

#[test]
fn test_subscribe_request_full_fields_roundtrip() {
    let original = proto::SubscribeRequest {
        kernel_id: "kernel-edge-99".to_string(),
        current_version: 0, // Request full snapshot
        org_id: "acme-corp".to_string(),
        dept_id: "legal".to_string(),
        team_id: "compliance".to_string(),
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::SubscribeRequest::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.kernel_id, "kernel-edge-99");
    assert_eq!(decoded.current_version, 0);
    assert_eq!(decoded.org_id, "acme-corp");
    assert_eq!(decoded.dept_id, "legal");
    assert_eq!(decoded.team_id, "compliance");
}

#[test]
fn test_subscribe_request_delta_resume_roundtrip() {
    let original = proto::SubscribeRequest {
        kernel_id: "kernel-vpc-3".to_string(),
        current_version: 42, // Resume from version 42
        org_id: "megacorp".to_string(),
        dept_id: String::new(),
        team_id: String::new(),
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::SubscribeRequest::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.kernel_id, "kernel-vpc-3");
    assert_eq!(decoded.current_version, 42);
    assert_eq!(decoded.org_id, "megacorp");
    assert!(decoded.dept_id.is_empty());
    assert!(decoded.team_id.is_empty());
}

// ── AcknowledgeResponse roundtrip ───────────────────────────────────

#[test]
fn test_acknowledge_response_roundtrip() {
    let original = proto::AcknowledgeResponse { acknowledged: true };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded =
        proto::AcknowledgeResponse::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.acknowledged, true);
}

// ── Edge cases ──────────────────────────────────────────────────────

#[test]
fn test_empty_subscribe_response_roundtrip() {
    let original = proto::SubscribeResponse {
        version: 0,
        r#type: 0, // UNSPECIFIED
        policies: vec![],
        removed_policy_ids: vec![],
        signature: vec![],
        signing_key_id: String::new(),
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::SubscribeResponse::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.version, 0);
    assert_eq!(decoded.r#type, 0);
    assert!(decoded.policies.is_empty());
    assert!(decoded.removed_policy_ids.is_empty());
    assert!(decoded.signature.is_empty());
    assert!(decoded.signing_key_id.is_empty());
}

#[test]
fn test_policy_entry_without_scope_roundtrip() {
    let original = proto::PolicyEntry {
        policy_id: "no-scope".to_string(),
        name: "No Scope Policy".to_string(),
        version: 1,
        wasm_bytes: vec![],
        wasm_hash: String::new(),
        rego_source: String::new(),
        entrypoint: String::new(),
        scope: None,
        fail_mode: 0,
    };

    let mut buf = Vec::new();
    original.encode(&mut buf).expect("encode should succeed");
    let decoded = proto::PolicyEntry::decode(buf.as_slice()).expect("decode should succeed");

    assert_eq!(decoded.policy_id, "no-scope");
    assert!(decoded.scope.is_none());
}
