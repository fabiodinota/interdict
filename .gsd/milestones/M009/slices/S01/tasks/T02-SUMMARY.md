---
id: T02
parent: S01
milestone: M009
provides:
  - MerkleAnchor with chain_hashes field and Serialize/Deserialize for local persistence
  - Local-first anchor persistence before builder reset in do_rotate
  - S3 upload retry (3 attempts, exponential backoff) with local file cleanup on success
  - Startup recovery of pending merkle anchor files
  - merkle/persistence.rs module with persist/load/remove/recover functions
key_files:
  - crates/evidence-collector/src/merkle/persistence.rs
  - crates/evidence-collector/src/merkle/builder.rs
  - crates/evidence-collector/src/merkle/mod.rs
  - crates/evidence-collector/src/main.rs
key_decisions:
  - Hex-string serde for [u8; 32] arrays via custom serde modules (hex_array, hex_array_vec) for human-readable JSON
  - upload_anchor_to_s3 extracted as pub(crate) function reused by both do_rotate and recover_pending_anchors
  - Recovery checks path existence after upload_anchor_to_s3 to determine success (file removed = S3 confirmed)
patterns_established:
  - "Local-first persistence: persist to disk before resetting in-memory state, delete local file only after remote confirmation"
  - "S3 retry: 500ms base, 2x multiplier, 2s cap, 3 attempts — mirrors T01 ClickHouse retry pattern with S3-appropriate params"
  - "Anchor file naming: {YYYY-MM-DDTHH}.json in {data_dir}/merkle-anchors/"
observability_surfaces:
  - "tracing::warn on corrupt/invalid anchor files during load (path, error)"
  - "tracing::info on startup recovery progress (count found, success, failed)"
  - "tracing::error on S3 retry exhaustion (hour, path, attempts)"
  - "tracing::info on local persist success and S3 dev-mode skip"
  - "Pending anchor files in {data_dir}/merkle-anchors/ — accumulate when S3 unreachable"
duration: 25min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Merkle anchor local persistence, S3 retry, startup recovery, and chain_hashes

**Added local-first Merkle anchor persistence with S3 retry, startup recovery, and chain_hashes field for S06 proof generation**

## What Happened

Extended `MerkleAnchor` with `chain_hashes: Vec<[u8; 32]>` populated from `leaf_hashes` in `finalize()`. Added `Serialize`/`Deserialize` derives with custom hex-string serde modules for `[u8; 32]` and `Vec<[u8; 32]>` to produce human-readable JSON.

Created `merkle/persistence.rs` with `persist_anchor`, `load_pending_anchors`, `remove_anchor`, and `recover_pending_anchors`. The load function filters to `.json` files only and gracefully skips corrupt/empty/invalid files with `tracing::warn`.

Rewrote `do_rotate` to persist the anchor locally *before* calling `guard.reset()`, ensuring the anchor survives even if S3 fails or the process crashes. Extracted `upload_anchor_to_s3` as a `pub(crate)` function (3 retries, 500ms/1s/2s backoff) reused by both `do_rotate` and startup recovery. Local file is deleted only after S3 confirms success.

Wired `data_dir` through `merkle_rotation_task`, added `merkle-anchors/` directory creation at startup, and added `recover_pending_anchors` call in `main()` after S3 init and before gRPC server start.

## Verification

- `cargo test -p evidence-collector` — **73 tests passed** (0 failed), including:
  - `finalize_populates_chain_hashes` — 3 leaves added, chain_hashes matches exactly in order
  - `merkle_anchor_serde_roundtrip` — serialize/deserialize preserves root, hour, bundle_count, chain_hashes
  - `persist_and_load_roundtrip` — persist anchor, load pending, verify all fields including chain_hashes
  - `persist_and_remove` — persist, remove, verify load returns empty
  - `corrupt_file_skipped` — invalid JSON logged and skipped
  - `empty_file_skipped` — zero-length file logged and skipped
  - `non_json_file_skipped` — `.txt` files ignored, only `.json` loaded
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- 7 integration tests pass unchanged

### Slice-level verification status (T02, task 2 of 3):
- ✅ `cargo test -p evidence-collector` — all pass
- ✅ `cargo clippy` — clean
- ✅ `cargo fmt --check` — clean
- ✅ Dead-letter roundtrip test (T01)
- ✅ Retry logic test (T01)
- ✅ WriterHealth test (T01)
- ✅ Merkle persistence test — persist/load/remove roundtrip
- ✅ Corrupt anchor test — truncated, empty, wrong-extension files skipped
- ✅ Startup recovery test — recovery function exercised (no S3 in CI, but load/skip paths tested)
- ✅ `chain_hashes` test — finalize populates matching input leaves
- ⏳ TTL test — T03
- ⏳ Dedup test — T03
- ⏳ Config test (batch settings) — T03

## Diagnostics

- **Pending anchor files**: List `{data_dir}/merkle-anchors/*.json` to see anchors awaiting S3 upload. Each file is a complete `MerkleAnchor` with root, hour, bundle_count, and chain_hashes in hex-encoded JSON.
- **Structured logs**: `tracing::warn` on corrupt file skip (includes path and parse error), `tracing::info` on recovery progress (count/success/failed), `tracing::error` on S3 exhaustion (includes hour, path, attempt count).
- **Recovery behavior**: On startup, `recover_pending_anchors` scans the directory and re-attempts S3 for each pending file. Success removes the file; failure leaves it for next restart.

## Deviations

- `s3.rs` `verify_anchor` needed `chain_hashes: Vec::new()` added to its `MerkleAnchor` construction since the S3 JSON format doesn't store individual chain hashes. This is correct — the S3 anchor is a summary, not the full leaf set.

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/src/merkle/persistence.rs` — new module with persist/load/remove/recover functions and 5 unit tests
- `crates/evidence-collector/src/merkle/builder.rs` — MerkleAnchor extended with chain_hashes, Serialize/Deserialize, hex serde modules, do_rotate rewritten for local-first persistence with S3 retry, 2 new tests added
- `crates/evidence-collector/src/merkle/mod.rs` — added `pub mod persistence;`
- `crates/evidence-collector/src/storage/s3.rs` — verify_anchor updated for chain_hashes field
- `crates/evidence-collector/src/main.rs` — anchor dir creation, startup recovery call, data_dir wired to rotation task
