---
estimated_steps: 6
estimated_files: 5
---

# T02: Merkle anchor local persistence, S3 retry, startup recovery, and chain_hashes

**Slice:** S01 — Evidence Pipeline Resilience
**Milestone:** M009

## Description

The current `do_rotate` in `merkle/builder.rs` resets the Merkle builder *before* confirming S3 upload — the anchor is lost if S3 fails. This task persists anchors locally before reset, retries S3 with backoff, recovers pending anchors on startup, and extends `MerkleAnchor` with `chain_hashes` for S06's proof generation.

## Steps

1. **Extend `MerkleAnchor` with `chain_hashes` and derive Serialize/Deserialize** — In `merkle/builder.rs`:
   - Add `pub chain_hashes: Vec<[u8; 32]>` field to `MerkleAnchor`.
   - In `finalize()`, clone `self.leaf_hashes` into the anchor: `chain_hashes: self.leaf_hashes.clone()`.
   - Derive `Serialize, Deserialize` on `MerkleAnchor`. For `[u8; 32]` arrays, use `serde_bytes` or hex-string serialization (add a custom serde module or use `#[serde(with = "hex_array")]` helper). The `root` field is `[u8; 32]` and `chain_hashes` is `Vec<[u8; 32]>` — both need hex-string JSON representation for human-readable dead-letter files.
   - Update all existing tests that construct `MerkleAnchor` (if any) to include `chain_hashes`.
   - Add test: `finalize_populates_chain_hashes` — add 3 leaf hashes, finalize, verify `chain_hashes` contains exactly those 3 hashes in order.

2. **Create `merkle/persistence.rs` module** — Implement:
   - `pub fn anchor_dir(data_dir: &Path) -> PathBuf` → `{data_dir}/merkle-anchors/`
   - `pub async fn persist_anchor(data_dir: &Path, anchor: &MerkleAnchor) -> Result<PathBuf>` → serialize anchor to JSON, write to `{data_dir}/merkle-anchors/{hour_formatted}.json` where `hour_formatted` is `anchor.hour.format("%Y-%m-%dT%H").to_string()`. Return the file path.
   - `pub async fn load_pending_anchors(data_dir: &Path) -> Vec<(PathBuf, MerkleAnchor)>` → read all `.json` files in the anchor directory. For each: try to deserialize; on failure, log `tracing::warn` with file path and error, skip the file. Return successfully parsed anchors.
   - `pub async fn remove_anchor(path: &Path) -> Result<()>` → `tokio::fs::remove_file(path)`.
   - Add `pub mod persistence;` to `merkle/mod.rs`.

3. **Modify `do_rotate` for local-first persistence** — In `merkle/builder.rs`, change `do_rotate`:
   ```
   Current flow:
     finalize → reset → drop lock → S3 upload (fire and forget)
   
   New flow:
     finalize → persist_anchor(data_dir, &anchor) → reset → drop lock → S3 upload with retry → remove local file on S3 success
   ```
   - `do_rotate` needs `data_dir: &Path` parameter (threaded from the rotation task).
   - After `persist_anchor`, call `guard.reset(new_hour)` and drop the lock.
   - S3 upload: retry 3 times with backoff (500ms base, 2x multiplier, 2s cap). Use `tokio::time::sleep`.
   - On S3 success: call `remove_anchor(&local_path)`.
   - On S3 exhaustion: log `tracing::error` — the local file remains for startup recovery.
   - If S3 is `None` (dev mode): log info, leave local file (no deletion).
   - Update `merkle_rotation_task` to accept `data_dir` and pass to `do_rotate`.

4. **Add startup recovery** — Create `pub async fn recover_pending_anchors(data_dir: &Path, s3_anchor: &Option<Arc<S3Anchor>>)` in `merkle/persistence.rs`:
   - Call `load_pending_anchors(data_dir)`.
   - For each `(path, anchor)`: attempt S3 upload (3 retries with backoff). On success: `remove_anchor(&path)`. On failure: log error, leave file.
   - If `s3_anchor` is `None`: log info, skip (files remain for when S3 is configured).
   - Call this function from `main.rs` after S3Anchor initialization, before starting the gRPC server.

5. **Wire `data_dir` through rotation task** — In `main.rs`:
   - Create merkle-anchors directory at startup: `tokio::fs::create_dir_all(anchor_dir(&cfg.data_dir)).await?`.
   - Pass `cfg.data_dir.clone()` to `merkle_rotation_task`.
   - Call `recover_pending_anchors(&cfg.data_dir, &s3_anchor).await` before spawning the gRPC server.
   - Update `merkle_rotation_task` signature to accept `data_dir: PathBuf`.

6. **Add unit tests** — In `merkle/persistence.rs` (`#[cfg(test)]`):
   - `persist_and_load_roundtrip`: persist an anchor, load pending, verify content matches including `chain_hashes`.
   - `persist_and_remove`: persist, remove, verify load returns empty.
   - `corrupt_file_skipped`: write invalid JSON to anchor dir, call `load_pending_anchors`, verify it returns empty and doesn't panic.
   - `empty_file_skipped`: write zero-length file, verify skipped.
   - `non_json_file_skipped`: write a `.txt` file, verify skipped (only `.json` files processed).

## Must-Haves

- [ ] `MerkleAnchor.chain_hashes` populated from `leaf_hashes` in `finalize()`
- [ ] Anchor persisted to local JSON file before `reset()` in `do_rotate`
- [ ] S3 upload retried 3 times with exponential backoff
- [ ] Local anchor file deleted only after S3 confirms success
- [ ] Startup recovery scans pending anchors and re-attempts S3
- [ ] Corrupt/invalid anchor files logged and skipped without panic
- [ ] `Serialize + Deserialize` on `MerkleAnchor` with hex-encoded byte arrays
- [ ] All new and existing tests pass

## Verification

- `cargo test -p evidence-collector` — all tests pass including new persistence and chain_hashes tests
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

## Observability Impact

- Signals added: `tracing::warn` on corrupt anchor file skip (path, error), `tracing::info` on recovery progress (anchors found, processed, failed), `tracing::error` on S3 retry exhaustion (anchor hour, file path)
- How a future agent inspects this: list files in `{data_dir}/merkle-anchors/` to see pending anchors; structured logs show recovery status
- Failure state exposed: pending anchor files accumulate when S3 is unreachable; recovery log shows per-anchor success/failure

## Inputs

- `crates/evidence-collector/src/merkle/builder.rs` — current `MerkleAnchor` struct (no `chain_hashes`), `do_rotate` that resets before S3, `finalize()` that doesn't clone leaves
- `crates/evidence-collector/src/storage/s3.rs` — `S3Anchor::anchor_merkle_root` does single `put_object` with no retry
- `crates/evidence-collector/src/main.rs` — current wiring, no startup recovery
- `crates/evidence-collector/src/config.rs` — `data_dir` field added by T01
- T01 adds `data_dir` to `CollectorConfig` and creates `dead_letter_dir` at startup — this task adds `anchor_dir` creation alongside it

## Expected Output

- `crates/evidence-collector/src/merkle/persistence.rs` — new module with persist/load/remove/recover functions and tests
- `crates/evidence-collector/src/merkle/builder.rs` — `MerkleAnchor` with `chain_hashes`, `Serialize`/`Deserialize`, updated `do_rotate` with local-first persistence and S3 retry
- `crates/evidence-collector/src/merkle/mod.rs` — `pub mod persistence;` added
- `crates/evidence-collector/src/storage/s3.rs` — no changes (S3 retry is in `do_rotate`, not in `S3Anchor`)
- `crates/evidence-collector/src/main.rs` — anchor dir creation, startup recovery call, `data_dir` passed to rotation task
