---
id: T03
parent: S06
milestone: M009
provides:
  - MerkleAnchor::proof_for_bundle() generates Merkle inclusion proofs from chain_hashes
  - interdict-verify verify_bundle_proof() validates proofs against expected root
  - Roundtrip integration test proves bundle→chain→merkle→verify pipeline
key_files:
  - crates/evidence-collector/src/merkle/builder.rs
  - crates/interdict-verify/src/merkle.rs
  - crates/evidence-collector/tests/roundtrip_test.rs
key_decisions:
  - MerkleProof import gated behind #[cfg(test)] in builder.rs since proof_for_bundle() uses tree.proof() which returns the proof implicitly without naming the type
patterns_established:
  - MerkleProofData as serializable proof container (proof_bytes + leaf_index + total_leaves + root) decoupling rs_merkle internals from consumers
observability_surfaces:
  - none (test-only code, no runtime signals)
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Merkle proof generation, verification, and roundtrip integration test

**Added MerkleProofData struct, proof_for_bundle() on MerkleAnchor, verify_bundle_proof() in interdict-verify, and a roundtrip integration test proving the full bundle→chain→merkle→verify pipeline**

## What Happened

Three implementation pieces, each straightforward:

1. **builder.rs** — Added `MerkleProofData` struct (proof_bytes, leaf_index, total_leaves, root) and `MerkleAnchor::proof_for_bundle()` that scans `chain_hashes` for the target hash, rebuilds the tree via `MerkleTree::from_leaves`, and returns the serialized proof. Missing hashes return `None`. Three unit tests: existing bundle at index 2, missing bundle, and single-leaf edge case.

2. **interdict-verify merkle.rs** — Added `verify_bundle_proof()` that deserializes proof bytes via `MerkleProof::from_bytes()` and calls `.verify()` against the expected root. Invalid/corrupted bytes return `false` (no panic). Two unit tests: valid proof roundtrip and corrupted bytes returning false.

3. **roundtrip_test.rs** — Integration test creating 5 synthetic bundles with chained hashes (each predecessor is previous chain_hash), building a Merkle tree, generating proofs for all 5, verifying each via `verify_bundle_proof`, and confirming `verify_merkle_root` against the full set. Also tests negative cases: non-existent hash returns None, corrupted proof fails verification.

## Verification

- `cargo test -p evidence-collector -- merkle` — 16 passed (3 new proof tests + 13 existing)
- `cargo test -p evidence-collector -- roundtrip` — 1 passed (new integration test)
- `cargo test -p interdict-verify -- merkle` — 8 passed (2 new verify_bundle_proof tests + 6 existing)
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

### Slice-level verification (intermediate — T03 of T05):
- ✅ `cargo test -p evidence-collector` — passes (merkle, roundtrip)
- ✅ `cargo test -p interdict-verify` — passes (merkle proof verification)
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — clean
- ✅ `cargo fmt --all -- --check` — clean
- ⬜ `buf lint` — not re-run (proto unchanged this task, passed in T01)
- ⬜ `cargo test --workspace --all-targets` — not run (full workspace, will run on final task)
- ⬜ `bun test` (control-plane/) — pending T05
- ⬜ `npx vitest run` (dashboard/) — pending T05

## Diagnostics

- `cargo test -p evidence-collector -- roundtrip` proves the full chain+sign+merkle pipeline
- Test assertions pinpoint which stage fails: chain integrity, proof generation (None when expected Some), proof verification (false when expected true), or root verification (MerkleVerificationResult.valid)
- Corrupted proof test uses XOR on last byte — deterministic failure reproduction

## Deviations

None. Plan called for `#[tokio::test]` for the roundtrip test — used plain `#[test]` since all operations are synchronous (no async in builder or verify functions).

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/src/merkle/builder.rs` — Added `MerkleProofData` struct, `MerkleAnchor::proof_for_bundle()` method, 3 unit tests
- `crates/interdict-verify/src/merkle.rs` — Added `verify_bundle_proof()` function, 2 unit tests
- `crates/evidence-collector/tests/roundtrip_test.rs` — New integration test proving full bundle→chain→merkle→verify pipeline
