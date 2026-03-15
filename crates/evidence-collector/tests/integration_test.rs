//! End-to-end integration tests for the Interdict evidence pipeline.
//!
//! These tests prove the full pipeline from evidence creation through
//! chain hashing, signing, Merkle tree construction, and verification
//! without requiring external services (ClickHouse, S3).

use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use ed25519_dalek::{Verifier, VerifyingKey};
use prost::Message;
use sha2::{Digest, Sha256};

use evidence_collector::chain::hasher::ChainManager;
use evidence_collector::merkle::builder::HourlyMerkleBuilder;
use evidence_collector::signing::SigningProvider;
use evidence_collector::signing::local::LocalSigningProvider;
use evidence_collector::storage::clickhouse::EvidenceRow;

// Use interdict_verify's proto types for verification functions.
use interdict_verify::chain::verify_chain;
use interdict_verify::merkle::verify_merkle_root;
use interdict_verify::proto::EvidenceBundle as VerifyBundle;
use interdict_verify::signature::verify_bundle_signatures;

/// Helper: create a bundle using the collector's chain manager and signing provider,
/// returning an interdict-verify compatible EvidenceBundle.
async fn create_signed_bundle(
    chain_manager: &mut ChainManager,
    signing_provider: &LocalSigningProvider,
    kernel_id: &str,
    index: u64,
) -> VerifyBundle {
    let mut bundle = VerifyBundle {
        bundle_id: format!("{kernel_id}-bundle-{index}"),
        kernel_id: kernel_id.to_string(),
        actor_identity: format!("user-{}", index % 10),
        department: "engineering".to_string(),
        vendor: "api.openai.com".to_string(),
        model: "gpt-4o".to_string(),
        prompt_hash: format!("phash-{index:04}"),
        response_hash: format!("rhash-{index:04}"),
        policy_action: if index.is_multiple_of(5) {
            "block"
        } else {
            "allow"
        }
        .to_string(),
        policy_rules_json: "[]".to_string(),
        token_count: (index * 10 + 100) as u32,
        enforcement_latency_us: 50 + index,
        schema_version: 1,
        ..Default::default()
    };

    // Content bytes with chain/sig fields at default (matching collector flow).
    let content_bytes = bundle.encode_to_vec();

    // Chain hashing via ChainManager.
    let (chain_hash, sequence_number, previous_hash) =
        chain_manager.link(kernel_id, &content_bytes);

    // Sign the content bytes.
    let signature = signing_provider
        .sign(&content_bytes)
        .await
        .expect("signing should succeed");

    // Set chain/sig metadata on the bundle.
    bundle.chain_hash = chain_hash.to_vec();
    bundle.previous_hash = previous_hash.to_vec();
    bundle.sequence_number = sequence_number;
    bundle.signature = signature;
    bundle.signing_key_id = signing_provider.key_id().to_string();
    bundle.dev_signed = signing_provider.is_dev_key();

    bundle
}

// ---------------------------------------------------------------------------
// Test 1: Chain integrity roundtrip with tamper detection (EVID-02, EVID-03, EVID-10)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_chain_integrity_roundtrip() {
    let mut chain_manager = ChainManager::new();
    let signing_provider = LocalSigningProvider::generate();
    let kernel_id = "test-kernel-1";

    // Generate 100 evidence bundles with sequential content.
    let mut bundles = Vec::new();
    for i in 0..100u64 {
        let bundle =
            create_signed_bundle(&mut chain_manager, &signing_provider, kernel_id, i).await;
        bundles.push(bundle);
    }

    // Verify the chain using interdict-verify.
    let chain_result = verify_chain(&bundles);
    assert!(
        chain_result.valid,
        "chain should be valid: {chain_result:?}"
    );
    assert_eq!(chain_result.total_bundles_checked, 100);
    assert_eq!(chain_result.kernel_results.len(), 1);
    assert!(chain_result.kernel_results[0].valid);

    // Verify signatures using interdict-verify.
    let mut public_keys = HashMap::new();
    public_keys.insert(
        signing_provider.key_id().to_string(),
        signing_provider.public_key().to_vec(),
    );
    let sig_result = verify_bundle_signatures(&bundles, &public_keys);
    assert!(sig_result.valid, "all signatures should be valid");
    assert_eq!(sig_result.valid_count, 100);
    assert_eq!(sig_result.invalid_count, 0);

    // Now tamper with one bundle's content (modify a field).
    bundles[42].actor_identity = "tampered-user".to_string();

    // Re-run chain verification -- should detect the tamper.
    let tampered_chain = verify_chain(&bundles);
    assert!(
        !tampered_chain.valid,
        "chain should be invalid after tamper"
    );
    let kr = &tampered_chain.kernel_results[0];
    assert!(!kr.valid);
    // The tamper at index 42 (seq 43) should be detected.
    assert_eq!(kr.first_invalid_sequence, Some(43));

    // Re-run signature verification -- should also detect the tamper.
    let tampered_sig = verify_bundle_signatures(&bundles, &public_keys);
    assert!(!tampered_sig.valid, "tampered bundle should fail sig check");
    assert!(tampered_sig.invalid_count >= 1);
}

// ---------------------------------------------------------------------------
// Test 2: Merkle tree construction and verification (EVID-04, EVID-10)
// ---------------------------------------------------------------------------
#[test]
fn test_merkle_tree_construction_and_verification() {
    let hour = Utc
        .with_ymd_and_hms(2026, 2, 28, 14, 0, 0)
        .single()
        .unwrap();
    let mut builder = HourlyMerkleBuilder::new(hour, 1_000_000);

    // Create 50 bundle hashes and add them to the Merkle builder.
    let mut bundle_hashes: Vec<[u8; 32]> = Vec::new();
    for i in 0..50u8 {
        let mut hasher = Sha256::new();
        hasher.update([i; 32]);
        let hash: [u8; 32] = hasher.finalize().into();
        builder.add_bundle_hash(hash);
        bundle_hashes.push(hash);
    }

    // Finalize and get the anchor.
    let anchor = builder.finalize().expect("should produce anchor");
    assert_eq!(anchor.bundle_count, 50);
    assert_eq!(anchor.hour, hour);

    // Serialize anchor to JSON (simulating S3 export).
    let anchor_json = serde_json::json!({
        "hour": anchor.hour.to_rfc3339(),
        "merkle_root": hex::encode(anchor.root),
        "bundle_count": anchor.bundle_count,
        "anchored_at": Utc::now().to_rfc3339(),
    });
    let anchor_str = anchor_json.to_string();

    // Parse back and verify.
    let parsed_anchor =
        interdict_verify::merkle::parse_anchor_json(&anchor_str).expect("should parse anchor");
    assert_eq!(parsed_anchor.merkle_root, anchor.root);
    assert_eq!(parsed_anchor.bundle_count, 50);

    // Create EvidenceBundle structs with these hashes for Merkle verification.
    let bundles: Vec<VerifyBundle> = bundle_hashes
        .iter()
        .enumerate()
        .map(|(i, hash)| VerifyBundle {
            bundle_id: format!("bundle-{i}"),
            kernel_id: "kernel-1".to_string(),
            chain_hash: hash.to_vec(),
            ..Default::default()
        })
        .collect();

    // Verify Merkle root matches.
    let merkle_result = verify_merkle_root(&bundles, &anchor.root);
    assert!(merkle_result.valid, "Merkle root should match");
    assert_eq!(merkle_result.leaf_count, 50);

    // Modify one leaf hash and verify root changes (tamper detection).
    let mut tampered_bundles = bundles.clone();
    tampered_bundles[25].chain_hash = vec![0xffu8; 32];

    let tampered_result = verify_merkle_root(&tampered_bundles, &anchor.root);
    assert!(
        !tampered_result.valid,
        "tampered bundle should change Merkle root"
    );
}

// ---------------------------------------------------------------------------
// Test 3: Evidence buffer non-blocking behavior (KERN-14)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_evidence_buffer_nonblocking() {
    use kernel::evidence::EvidenceBuffer;
    use kernel::evidence::bundle::RawEvidenceEvent;
    use std::time::Instant;

    let buffer = EvidenceBuffer::stub();

    // Measure time to try_send 10,000 events.
    let start = Instant::now();
    for i in 0..10_000 {
        let event = RawEvidenceEvent {
            timestamp: Utc::now(),
            actor_identity: format!("user-{i}"),
            department: "test".to_string(),
            vendor: "api.openai.com".to_string(),
            model: "gpt-4o".to_string(),
            prompt_hash: format!("hash-{i}"),
            response_hash: String::new(),
            prompt_text: None,
            response_text: None,
            policy_action: "allow".to_string(),
            policy_rules: vec![],
            token_count: 100,
            enforcement_latency_us: 50,
        };
        buffer.try_send(event);
    }
    let elapsed = start.elapsed();

    // Assert total time < 50ms (proving non-blocking behavior).
    // WSL2 cross-filesystem I/O adds latency; 50ms is still orders of magnitude
    // faster than any blocking implementation would allow.
    assert!(
        elapsed.as_millis() < 50,
        "10,000 try_send calls should complete in under 50ms, took {}ms",
        elapsed.as_millis()
    );
}

// ---------------------------------------------------------------------------
// Test 4: Evidence bundle schema completeness (EVID-06)
// ---------------------------------------------------------------------------
#[test]
#[allow(deprecated)] // Tests backward-compat fields scheduled for removal in v2.0
fn test_evidence_bundle_schema_completeness() {
    use kernel::evidence::bundle::{RawEvidenceEvent, to_proto_bundle};

    let event = RawEvidenceEvent {
        timestamp: Utc::now(),
        actor_identity: "alice@corp.example".to_string(),
        department: "legal".to_string(),
        vendor: "api.openai.com".to_string(),
        model: "gpt-4o".to_string(),
        prompt_hash: "a".repeat(64),
        response_hash: "b".repeat(64),
        prompt_text: Some("What is the contract status?".to_string()),
        response_text: Some("The contract is under review.".to_string()),
        policy_action: "allow".to_string(),
        policy_rules: vec!["rule-1".to_string(), "rule-2".to_string()],
        token_count: 42,
        enforcement_latency_us: 1234,
    };

    let proto = to_proto_bundle(&event, "kernel-test-1");

    // Serialize to protobuf bytes and deserialize.
    let encoded = proto.encode_to_vec();
    let decoded = kernel::evidence::proto::EvidenceBundle::decode(encoded.as_slice())
        .expect("protobuf roundtrip should succeed");

    // Assert all EVID-06 fields survive the roundtrip.
    assert_eq!(decoded.kernel_id, "kernel-test-1");
    assert_eq!(decoded.actor_identity, "alice@corp.example");
    assert_eq!(decoded.department, "legal");
    assert_eq!(decoded.vendor, "api.openai.com");
    assert_eq!(decoded.model, "gpt-4o");
    assert_eq!(decoded.prompt_hash, "a".repeat(64));
    assert_eq!(decoded.response_hash, "b".repeat(64));
    assert_eq!(decoded.prompt_text, "What is the contract status?");
    assert_eq!(decoded.response_text, "The contract is under review.");
    assert_eq!(decoded.policy_action, "allow");
    assert_eq!(decoded.policy_rules_json, r#"["rule-1","rule-2"]"#);
    assert_eq!(decoded.token_count, 42);
    assert_eq!(decoded.enforcement_latency_us, 1234);
    assert!(decoded.timestamp.is_some());
    assert_eq!(decoded.schema_version, 1);
    assert!(
        !decoded.bundle_id.is_empty(),
        "bundle_id should be set (UUID)"
    );
}

// ---------------------------------------------------------------------------
// Test 5: Signing provider dev mode (EVID-09)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_signing_provider_dev_mode() {
    let provider = LocalSigningProvider::generate();

    // Verify is_dev_key returns true.
    assert!(provider.is_dev_key(), "generated key should be dev key");

    // Verify key_id is a valid hex string.
    let key_id = provider.key_id();
    assert!(!key_id.is_empty(), "key_id should not be empty");
    assert!(
        hex::decode(key_id).is_ok(),
        "key_id should be valid hex: {key_id}"
    );

    // Sign a message and verify.
    let message = b"test evidence event content";
    let signature = provider
        .sign(message)
        .await
        .expect("signing should succeed");

    // Verify signature passes with the provider's public key.
    let pk_bytes: [u8; 32] = provider
        .public_key()
        .try_into()
        .expect("public key should be 32 bytes");
    let vk = VerifyingKey::from_bytes(&pk_bytes).expect("valid public key");
    let sig_bytes: [u8; 64] = signature
        .as_slice()
        .try_into()
        .expect("signature should be 64 bytes");
    let sig = ed25519_dalek::Signature::from_bytes(&sig_bytes);
    assert!(
        vk.verify(message, &sig).is_ok(),
        "signature should verify with provider's public key"
    );

    // Serialize public key, create new VerifyingKey, verify again.
    let serialized_pk = provider.public_key().to_vec();
    let pk2: [u8; 32] = serialized_pk.as_slice().try_into().expect("32 bytes");
    let vk2 = VerifyingKey::from_bytes(&pk2).expect("valid public key from serialized");
    assert!(
        vk2.verify(message, &sig).is_ok(),
        "signature should verify with reconstructed public key"
    );
}

// ---------------------------------------------------------------------------
// Test 6: ClickHouse row serialization (EVID-07)
// ---------------------------------------------------------------------------
#[test]
fn test_clickhouse_row_serialization() {
    let ts = Utc
        .with_ymd_and_hms(2026, 2, 28, 14, 30, 0)
        .single()
        .expect("valid timestamp");

    let row = EvidenceRow {
        event_date: EvidenceRow::from_timestamp(ts),
        timestamp: ts.timestamp_millis(),
        bundle_id: "test-bundle-1".to_string(),
        kernel_id: "kernel-1".to_string(),
        actor_identity: "analyst@corp.example".to_string(),
        department: "fraud".to_string(),
        vendor: "api.openai.com".to_string(),
        model: "gpt-4o".to_string(),
        prompt_hash: "p".repeat(64),
        response_hash: "r".repeat(64),
        prompt_text: String::new(),
        response_text: String::new(),
        policy_action: "allow".to_string(),
        policy_rules_json: r#"["rule-1"]"#.to_string(),
        token_count: 42,
        enforcement_latency_us: 100,
        chain_hash: "a".repeat(64),
        previous_hash: "0".repeat(64),
        sequence_number: 1,
        signature: "s".repeat(128),
        signing_key_id: "key-1".to_string(),
        dev_signed: 1,
        schema_version: 1,
        content_bytes: "cafebabe".to_string(),
    };

    // Serialize to JSON (the format ClickHouse crate uses for row insertion).
    let json_str = serde_json::to_string(&row).expect("row serialization");
    let decoded: EvidenceRow = serde_json::from_str(&json_str).expect("row deserialization");
    assert_eq!(row, decoded, "ClickHouse row roundtrip should be lossless");

    // Verify field names match the DDL schema.
    let ddl = evidence_collector::storage::clickhouse::table_ddl();
    assert!(ddl.contains("bundle_id"), "DDL should contain bundle_id");
    assert!(ddl.contains("kernel_id"), "DDL should contain kernel_id");
    assert!(
        ddl.contains("actor_identity"),
        "DDL should contain actor_identity"
    );
    assert!(ddl.contains("department"), "DDL should contain department");
    assert!(ddl.contains("vendor"), "DDL should contain vendor");
    assert!(ddl.contains("model"), "DDL should contain model");
    assert!(
        ddl.contains("prompt_hash"),
        "DDL should contain prompt_hash"
    );
    assert!(
        ddl.contains("response_hash"),
        "DDL should contain response_hash"
    );
    assert!(
        ddl.contains("policy_action"),
        "DDL should contain policy_action"
    );
    assert!(
        ddl.contains("token_count"),
        "DDL should contain token_count"
    );
    assert!(
        ddl.contains("enforcement_latency_us"),
        "DDL should contain enforcement_latency_us"
    );
    assert!(ddl.contains("chain_hash"), "DDL should contain chain_hash");
    assert!(
        ddl.contains("previous_hash"),
        "DDL should contain previous_hash"
    );
    assert!(
        ddl.contains("sequence_number"),
        "DDL should contain sequence_number"
    );
    assert!(ddl.contains("signature"), "DDL should contain signature");
    assert!(
        ddl.contains("signing_key_id"),
        "DDL should contain signing_key_id"
    );
    assert!(ddl.contains("dev_signed"), "DDL should contain dev_signed");
    assert!(
        ddl.contains("schema_version"),
        "DDL should contain schema_version"
    );
}

// ---------------------------------------------------------------------------
// Test 7: Multiple kernel chains are independently valid (Pitfall 2)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_multiple_kernel_chains_independent() {
    let mut chain_manager = ChainManager::new();
    let signing_provider = LocalSigningProvider::generate();

    let kernel_ids = ["kernel-a", "kernel-b", "kernel-c"];
    let mut bundles: Vec<VerifyBundle> = Vec::new();

    // Interleave bundles from 3 different kernel_ids.
    for round in 0..10u64 {
        for kernel_id in &kernel_ids {
            let bundle =
                create_signed_bundle(&mut chain_manager, &signing_provider, kernel_id, round).await;
            bundles.push(bundle);
        }
    }

    // Verify all chains are independently valid.
    let chain_result = verify_chain(&bundles);
    assert!(
        chain_result.valid,
        "all kernel chains should be valid: {chain_result:?}"
    );
    assert_eq!(
        chain_result.kernel_results.len(),
        3,
        "should have 3 independent kernel chains"
    );
    for kr in &chain_result.kernel_results {
        assert!(kr.valid, "kernel '{}' chain should be valid", kr.kernel_id);
        assert_eq!(kr.bundles_checked, 10);
    }
    assert_eq!(chain_result.total_bundles_checked, 30);

    // Tamper with one kernel's bundle -- other kernels should not be affected.
    let kernel_b_idx = bundles
        .iter()
        .position(|b| b.kernel_id == "kernel-b" && b.sequence_number == 5)
        .expect("should find kernel-b seq 5");
    bundles[kernel_b_idx].actor_identity = "tampered".to_string();

    let tampered_result = verify_chain(&bundles);
    assert!(
        !tampered_result.valid,
        "chain should be invalid after tamper"
    );

    // kernel-a and kernel-c should still be valid.
    for kr in &tampered_result.kernel_results {
        if kr.kernel_id == "kernel-b" {
            assert!(!kr.valid, "kernel-b should be invalid");
            assert_eq!(kr.first_invalid_sequence, Some(5));
        } else {
            assert!(
                kr.valid,
                "kernel '{}' should still be valid after tampering kernel-b",
                kr.kernel_id
            );
        }
    }
}
