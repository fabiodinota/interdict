//! Roundtrip integration test: bundles → chain → Merkle proof → verify.
//!
//! Proves FH-TESTING-01: the full pipeline from bundle creation through
//! hash chaining, Merkle tree construction, proof generation, and
//! proof verification works end-to-end.

use evidence_collector::merkle::builder::{HourlyMerkleBuilder, MerkleAnchor};
use sha2::{Digest, Sha256};

/// Compute a synthetic chain hash for a test bundle.
///
/// Real chain hashes include bundle content + predecessor hash.
/// This test version chains: H(bundle_id || previous_hash).
fn compute_chain_hash(bundle_id: &str, previous_hash: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bundle_id.as_bytes());
    hasher.update(previous_hash);
    hasher.finalize().into()
}

/// Synthetic bundle data for the roundtrip test.
struct TestBundle {
    bundle_id: String,
    chain_hash: [u8; 32],
    previous_hash: [u8; 32],
    sequence_number: u64,
}

fn create_test_bundles(count: usize) -> Vec<TestBundle> {
    let mut bundles = Vec::with_capacity(count);
    let mut prev_hash = [0u8; 32]; // Genesis predecessor is all zeros.

    for i in 0..count {
        let bundle_id = format!("bundle-{i:04}");
        let chain_hash = compute_chain_hash(&bundle_id, &prev_hash);

        bundles.push(TestBundle {
            bundle_id,
            chain_hash,
            previous_hash: prev_hash,
            sequence_number: i as u64,
        });

        prev_hash = chain_hash;
    }

    bundles
}

/// Convert test bundles to proto `EvidenceBundle` for `verify_merkle_root`.
fn to_proto_bundles(test_bundles: &[TestBundle]) -> Vec<interdict_verify::proto::EvidenceBundle> {
    test_bundles
        .iter()
        .map(|tb| interdict_verify::proto::EvidenceBundle {
            bundle_id: tb.bundle_id.clone(),
            chain_hash: tb.chain_hash.to_vec(),
            previous_hash: tb.previous_hash.to_vec(),
            sequence_number: tb.sequence_number,
            ..Default::default()
        })
        .collect()
}

#[test]
fn roundtrip_bundles_chain_merkle_proof_verify() {
    // 1. Create synthetic bundles with chained hashes.
    let test_bundles = create_test_bundles(5);

    // Verify chain integrity: each bundle's predecessor is the previous chain_hash.
    for i in 1..test_bundles.len() {
        assert_eq!(
            test_bundles[i].previous_hash,
            test_bundles[i - 1].chain_hash,
            "bundle {i} predecessor should be bundle {}'s chain hash",
            i - 1
        );
    }

    // 2. Build Merkle tree from chain hashes.
    let hour = chrono::Utc::now();
    let mut builder = HourlyMerkleBuilder::new(hour, 1_000_000);
    for tb in &test_bundles {
        builder.add_bundle_hash(tb.chain_hash);
    }
    let anchor: MerkleAnchor = builder
        .finalize()
        .expect("non-empty bundles should produce anchor");
    assert_eq!(anchor.bundle_count, 5);
    assert_eq!(anchor.chain_hashes.len(), 5);

    // 3. Generate and verify Merkle proofs for each bundle.
    for (i, tb) in test_bundles.iter().enumerate() {
        let proof = anchor
            .proof_for_bundle(&tb.chain_hash)
            .unwrap_or_else(|| panic!("proof should exist for bundle {i}"));

        assert_eq!(proof.leaf_index, i);
        assert_eq!(proof.total_leaves, 5);
        assert_eq!(proof.root, anchor.root);

        // 4. Verify each proof via interdict-verify.
        let valid = interdict_verify::merkle::verify_bundle_proof(
            &proof.proof_bytes,
            &tb.chain_hash,
            proof.leaf_index,
            proof.total_leaves,
            &proof.root,
        );
        assert!(
            valid,
            "proof for bundle {i} should verify against Merkle root"
        );
    }

    // 5. Verify Merkle root via the existing verify_merkle_root function.
    let proto_bundles = to_proto_bundles(&test_bundles);
    let root_result = interdict_verify::merkle::verify_merkle_root(&proto_bundles, &anchor.root);
    assert!(
        root_result.valid,
        "Merkle root verification should pass: {root_result:?}"
    );
    assert_eq!(root_result.leaf_count, 5);

    // 6. Negative: proof for non-existent hash returns None.
    let fake_hash = [0xDE; 32];
    assert!(
        anchor.proof_for_bundle(&fake_hash).is_none(),
        "non-existent hash should return None"
    );

    // 7. Negative: corrupted proof bytes should fail verification.
    let proof = anchor
        .proof_for_bundle(&test_bundles[0].chain_hash)
        .unwrap();
    let mut corrupted = proof.proof_bytes.clone();
    if let Some(b) = corrupted.last_mut() {
        *b ^= 0xFF;
    }
    let invalid = interdict_verify::merkle::verify_bundle_proof(
        &corrupted,
        &test_bundles[0].chain_hash,
        proof.leaf_index,
        proof.total_leaves,
        &proof.root,
    );
    assert!(!invalid, "corrupted proof should fail verification");
}
