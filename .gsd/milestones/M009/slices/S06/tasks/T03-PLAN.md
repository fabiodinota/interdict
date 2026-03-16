---
estimated_steps: 5
estimated_files: 5
---

# T03: Merkle proof generation, verification, and roundtrip integration test

**Slice:** S06 — Proto Safety, Observability & Testing
**Milestone:** M009

## Description

Add Merkle inclusion proof generation to MerkleAnchor (using `chain_hashes` from S01), proof verification to interdict-verify, and a roundtrip integration test that creates bundles → signs → chains → generates Merkle proofs → verifies all of them. This proves FH-TESTING-01.

## Steps

1. **Define `MerkleProofData` and add `proof_for_bundle()` on `MerkleAnchor`:** In `crates/evidence-collector/src/merkle/builder.rs`:
   - Add a new struct:
     ```rust
     #[derive(Debug, Clone)]
     pub struct MerkleProofData {
         pub proof_bytes: Vec<u8>,
         pub leaf_index: usize,
         pub total_leaves: usize,
         pub root: [u8; 32],
     }
     ```
   - Add method `MerkleAnchor::proof_for_bundle(&self, bundle_hash: &[u8; 32]) -> Option<MerkleProofData>`:
     - Scan `self.chain_hashes` to find the index of `bundle_hash`. Return `None` if not found.
     - Rebuild the `MerkleTree::<MerkleSha256>::from_leaves(&self.chain_hashes)` from `chain_hashes`
     - Call `tree.proof(&[leaf_index])` to get `MerkleProof<Sha256>`
     - Return `Some(MerkleProofData { proof_bytes: proof.to_bytes(), leaf_index, total_leaves: self.chain_hashes.len(), root: self.merkle_root })`
   - **Important:** `rs_merkle` `MerkleTree::from_leaves` expects `&[[u8; 32]]` — `chain_hashes` is already `Vec<[u8; 32]>` so `&self.chain_hashes` works directly.

2. **Add unit tests for proof generation** in the `#[cfg(test)]` module of `builder.rs`:
   - `test_proof_for_existing_bundle`: create anchor with 5 hashes, generate proof for hash at index 2, verify `proof_bytes` is non-empty, `leaf_index == 2`, `total_leaves == 5`, `root` matches `self.merkle_root`
   - `test_proof_for_missing_bundle`: create anchor, call `proof_for_bundle` with hash not in `chain_hashes`, verify returns `None`
   - `test_proof_for_single_leaf`: single-hash anchor, generate proof, verify it works (edge case for rs_merkle)

3. **Add `verify_bundle_proof()` to interdict-verify:** In `crates/interdict-verify/src/merkle.rs`:
   - Add function:
     ```rust
     pub fn verify_bundle_proof(
         proof_bytes: &[u8],
         leaf_hash: &[u8; 32],
         leaf_index: usize,
         total_leaves: usize,
         expected_root: &[u8; 32],
     ) -> bool
     ```
   - Implementation: `MerkleProof::<MerkleSha256>::from_bytes(proof_bytes)` — if this returns `Ok(proof)`, call `proof.verify(*expected_root, &[leaf_index], &[*leaf_hash], total_leaves)`. Return the result. If `from_bytes` fails, return `false`.
   - Re-export from `lib.rs` if not already publicly accessible.
   - Add unit tests in the same file: create a `MerkleTree::from_leaves`, extract proof via `tree.proof()`, verify with `verify_bundle_proof()`, also test with corrupted proof bytes returning false.

4. **Write roundtrip integration test:** Create `crates/evidence-collector/tests/roundtrip_test.rs`:
   - Create 3-5 test bundles with synthetic data (bundle_id, chain_hash, content hashes, timestamps, policy_action)
   - Chain them: each bundle's `predecessor_hash` is the previous bundle's `chain_hash`
   - Add chain hashes to an `HourlyMerkleBuilder`, call `finalize()` to get `MerkleAnchor`
   - For each bundle, call `anchor.proof_for_bundle(&bundle.chain_hash)` — verify `Some` returned
   - For each proof, call `interdict_verify::merkle::verify_bundle_proof(proof.proof_bytes, &hash, proof.leaf_index, proof.total_leaves, &proof.root)` — verify `true`
   - Also verify Merkle root matches: call `interdict_verify::merkle::verify_merkle_root(&bundles, &anchor.merkle_root)` — verify `valid == true`
   - Add the test as `#[tokio::test]` since the builder uses async code if needed, or plain `#[test]` if all operations are sync
   - Add `interdict-verify` to `[dev-dependencies]` in evidence-collector's `Cargo.toml` if not already present

5. **Verify:** Run `cargo test -p evidence-collector -- roundtrip`, `cargo test -p evidence-collector -- merkle`, `cargo test -p interdict-verify -- merkle`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all -- --check`.

## Must-Haves

- [ ] `MerkleProofData` struct with proof_bytes, leaf_index, total_leaves, root
- [ ] `MerkleAnchor::proof_for_bundle()` generates valid inclusion proofs from `chain_hashes`
- [ ] Missing hash returns `None` (not panic)
- [ ] `verify_bundle_proof()` in interdict-verify validates proofs against expected root
- [ ] Corrupted/invalid proof bytes return `false` (not panic)
- [ ] Roundtrip test creates bundles → chains → generates proofs → verifies all
- [ ] `interdict-verify` re-exports `verify_bundle_proof` publicly

## Verification

- `cargo test -p evidence-collector -- roundtrip` — integration test passes
- `cargo test -p evidence-collector -- merkle` — unit tests pass (proof gen for existing, missing, single-leaf)
- `cargo test -p interdict-verify -- merkle` — unit tests pass (verify valid, verify corrupted)
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

## Observability Impact

- Signals added/changed: none (test-only code, no runtime signals)
- How a future agent inspects this: `cargo test -p evidence-collector -- roundtrip` proves the full chain+sign+merkle pipeline
- Failure state exposed: test assertions pinpoint which stage fails (chain, proof gen, proof verify, root verify)

## Inputs

- `crates/evidence-collector/src/merkle/builder.rs` — `MerkleAnchor` struct with `chain_hashes: Vec<[u8; 32]>`, `merkle_root: [u8; 32]`, `HourlyMerkleBuilder` with `finalize()`. Uses `rs_merkle` 1.5 (already in deps).
- `crates/interdict-verify/src/merkle.rs` — existing `verify_merkle_root()` function and `MerkleAnchor` struct. Uses `rs_merkle` with `MerkleSha256` alias.
- S01 summary: `chain_hashes` is populated from `leaf_hashes` in `finalize()`. The `upload_anchor_to_s3` function is `pub(crate)`.

## Expected Output

- `crates/evidence-collector/src/merkle/builder.rs` — `MerkleProofData` struct + `proof_for_bundle()` method + 3 unit tests
- `crates/interdict-verify/src/merkle.rs` — `verify_bundle_proof()` function + 2 unit tests
- `crates/interdict-verify/src/lib.rs` — re-export if needed
- `crates/evidence-collector/tests/roundtrip_test.rs` — new integration test proving full pipeline
- `crates/evidence-collector/Cargo.toml` — `interdict-verify` in `[dev-dependencies]` if not present
