---
id: S01
parent: M009
milestone: M009
provides:
  - ClickHouse writer with 5-attempt exponential backoff retry (200ms base, 2x multiplier, 5s cap)
  - Dead-letter JSON file spill to {data_dir}/dead-letter/ on commit exhaustion
  - WriterHealth struct with atomic counters (rows_written, rows_retried, rows_dead_lettered)
  - Local-first Merkle anchor persistence to {data_dir}/merkle-anchors/ before builder reset
  - S3 upload retry (3 attempts, 500ms base backoff) with local file cleanup only after S3 confirm
  - Startup recovery of pending Merkle anchor files
  - MerkleAnchor.chain_hashes: Vec<[u8; 32]> populated from leaf_hashes in finalize()
  - Configurable ClickHouse retention TTL via table_ddl(retention_days) — replaces hardcoded 7 YEAR
  - Configurable inserter batch settings via COLLECTOR_CH_MAX_ROWS, COLLECTOR_CH_PERIOD_MS, COLLECTOR_CH_MAX_BYTES
  - Bundle-ID deduplication via bounded DeduplicationTracker (100K cap, FIFO eviction)
  - COLLECTOR_DATA_DIR env var for data directory configuration
requires:
  - slice: none
    provides: independent slice
affects:
  - S06
key_files:
  - crates/evidence-collector/src/storage/dead_letter.rs
  - crates/evidence-collector/src/storage/clickhouse.rs
  - crates/evidence-collector/src/storage/mod.rs
  - crates/evidence-collector/src/merkle/persistence.rs
  - crates/evidence-collector/src/merkle/builder.rs
  - crates/evidence-collector/src/merkle/mod.rs
  - crates/evidence-collector/src/storage/s3.rs
  - crates/evidence-collector/src/config.rs
  - crates/evidence-collector/src/grpc/service.rs
  - crates/evidence-collector/src/main.rs
  - crates/evidence-collector/tests/integration_test.rs
key_decisions:
  - "D060: Testable retry loop via #[cfg(test)] closure-based retry_with_backoff — production uses commit_with_retry on real Inserter"
  - "D061: pending_rows Vec buffers rows since last successful commit for dead-lettering — Inserter may lose its buffer on commit failure"
  - "D062: Custom serde hex modules (hex_array, hex_array_vec) for human-readable [u8; 32] JSON in anchor/dead-letter files"
  - "D063: Local-first anchor persistence — persist to disk before builder reset, delete only after S3 confirm"
  - "D064: InserterBatchSettings struct groups max_rows/period_ms/max_bytes to avoid clippy too_many_arguments"
  - "D065: Insertion-order (FIFO) eviction for DeduplicationTracker — simpler than true LRU, acceptable for rare duplicate scenario"
patterns_established:
  - "Exponential backoff: 200ms base, 2x multiplier, configurable cap — used for both ClickHouse (5s cap, 5 attempts) and S3 (2s cap, 3 attempts)"
  - "Dead-letter file naming: {timestamp_millis}-{bundle_id}.json in {data_dir}/dead-letter/"
  - "Health counter pattern: Arc<WriterHealth> with AtomicU64 + Relaxed ordering for monotonic stats"
  - "Local-first persistence: persist to disk before resetting in-memory state, delete local file only after remote confirmation"
  - "Bounded in-memory dedup: HashMap + VecDeque with FIFO eviction at capacity"
  - "Config struct grouping: InserterBatchSettings bundles related params to avoid argument sprawl"
  - "Anchor file naming: {YYYY-MM-DDTHH}.json in {data_dir}/merkle-anchors/"
observability_surfaces:
  - "WriterHealth atomic counters (rows_written, rows_retried, rows_dead_lettered) via ClickHouseWriter::health()"
  - "Dead-letter JSON files in {data_dir}/dead-letter/ for manual inspection and replay"
  - "Pending anchor files in {data_dir}/merkle-anchors/ — accumulate when S3 unreachable"
  - "tracing::warn on retry attempts (attempt number, backoff_ms, error) and corrupt anchor skip"
  - "tracing::error on dead-letter write (file path, bundle_id) and S3 retry exhaustion"
  - "tracing::info on successful retry, anchor persist, S3 dev-mode skip, startup recovery progress"
  - "tracing::warn on duplicate bundle_id rejection (bundle_id, kernel_id)"
drill_down_paths:
  - .gsd/milestones/M009/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S01/tasks/T03-SUMMARY.md
duration: 80min
verification_result: passed
completed_at: 2026-03-16
---

# S01: Evidence Pipeline Resilience

**Added ClickHouse write retry with exponential backoff and dead-letter spill, local-first Merkle anchor persistence with S3 retry and startup recovery, configurable retention TTL and batch settings, and bounded bundle-ID deduplication.**

## What Happened

Three tasks shipped the full evidence pipeline resilience suite:

**T01 — ClickHouse retry + dead-letter + WriterHealth.** The inserter worker previously silently dropped rows on `commit()` failure. Now it retries 5 times with exponential backoff (200ms base, 2x multiplier, 5s cap). On exhaustion, all pending rows since the last successful commit are serialized as JSON to `{data_dir}/dead-letter/{timestamp}-{bundle_id}.json`. `WriterHealth` tracks `rows_written`, `rows_retried`, and `rows_dead_lettered` via `AtomicU64` counters exposed through `ClickHouseWriter::health()` for S06's Prometheus integration. The retry logic is testable via a `#[cfg(test)]` closure-based `retry_with_backoff` function that avoids needing ClickHouse in CI.

**T02 — Merkle anchor persistence + S3 retry + startup recovery + chain_hashes.** `do_rotate` previously reset the builder before confirming S3 upload — anchors were lost on S3 failure. Now the anchor is persisted locally to `{data_dir}/merkle-anchors/{hour}.json` *before* `guard.reset()`. S3 upload retries 3 times (500ms/1s/2s backoff), and the local file is deleted only after S3 confirms. On startup, `recover_pending_anchors` scans the directory and re-attempts S3 for each pending file. `MerkleAnchor` gained `chain_hashes: Vec<[u8; 32]>` populated from `leaf_hashes` in `finalize()`, with custom hex-string serde modules for human-readable JSON. Corrupt/empty/non-JSON files are logged and skipped without panic.

**T03 — Retention TTL + batch settings + dedup.** `table_ddl()` now accepts `retention_days: u32` and interpolates the configured value instead of a hardcoded `7 YEAR`. Inserter batch settings (`max_rows`, `period_ms`, `max_bytes`) are configurable via env vars and grouped into `InserterBatchSettings` to avoid argument sprawl. `DeduplicationTracker` uses `HashMap` + `VecDeque` for O(1) lookup with FIFO eviction at 100K capacity, rejecting duplicate `bundle_id` values before processing.

## Verification

- `cargo test -p evidence-collector` — **79 unit tests + 7 integration tests pass** (0 failures)
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

All slice-plan verification checks confirmed:
- ✅ Dead-letter roundtrip test: creates file from EvidenceRow, reads back, verifies field equality
- ✅ Retry logic test: simulates commit failures via callback, verifies 5 attempts with backoff, dead-letter on exhaustion
- ✅ WriterHealth test: verifies counters increment correctly on write/retry/dead-letter
- ✅ Merkle persistence test: persist/load/remove roundtrip
- ✅ Corrupt anchor test: truncated/invalid/empty JSON files logged and skipped without panic
- ✅ Startup recovery test: pending anchor files processed
- ✅ chain_hashes test: finalize() populates chain_hashes matching input leaf hashes
- ✅ TTL test: table_ddl(30) contains `INTERVAL 30 DAY DELETE`
- ✅ Dedup test: duplicate bundle_id rejected, unique accepted, eviction at capacity works
- ✅ Config test: env var parsing for data_dir, ch_max_rows, ch_period_ms, ch_max_bytes

Two milestone proof-strategy risks retired:
- Dead-letter format → roundtrip serialization test passes for all EvidenceRow field types ✅
- Anchor recovery → startup scan handles corrupt files without panic ✅

## Requirements Advanced

- FH-INTEGRITY-01 — All 5 sub-findings addressed: ClickHouse retry with dead-letter (H-01), Merkle anchor local persistence with S3 retry (H-02), configurable retention TTL (M-02), configurable batch settings (M-03), bundle-ID deduplication (L-04). Full evidence from tests. Remains active until S06 wires WriterHealth to Prometheus metrics and uses chain_hashes for proof generation.

## Requirements Validated

- none — FH-INTEGRITY-01 depends on S06 for Prometheus metrics exposure and proof generation

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **T01**: `retry_with_backoff` marked `#[cfg(test)]` instead of `pub(crate)` to avoid dead_code warning — production path uses `commit_with_retry` on the real Inserter.
- **T02**: `s3.rs` `verify_anchor` needed `chain_hashes: Vec::new()` added since the S3 JSON anchor is a summary, not the full leaf set.
- **T03**: `process_bundle` returns `Err(anyhow!("duplicate bundle_id"))` instead of `Err(tonic::Status::already_exists(...))` — the streaming gRPC pattern counts individual errors in `rejected_count` rather than terminating the stream. FIFO eviction chosen over LRU for simplicity (D065).

## Known Limitations

- **DeduplicationTracker is in-memory only** — restarts clear the dedup set. Acceptable for 100K capacity with rare duplicates; persistent dedup would require ClickHouse query overhead.
- **Dead-letter files have no automatic replay mechanism** — manual inspection and replay only. Automated replay could be added in a future slice.
- **S3 anchor recovery depends on S3 being reachable at startup** — if S3 is down at startup, pending anchors remain and are retried on next startup. No background retry loop post-startup.

## Follow-ups

- S06 must wire `WriterHealth` counters to Prometheus metrics (evidence_written_total, retried_total, dead_lettered_total)
- S06 must use `MerkleAnchor.chain_hashes` for `proof_for_bundle()` implementation
- Future: consider background retry loop for pending anchors instead of startup-only recovery
- Future: dead-letter replay tool or admin endpoint

## Files Created/Modified

- `crates/evidence-collector/src/storage/dead_letter.rs` — new — dead-letter directory helper and async write function with tests
- `crates/evidence-collector/src/storage/clickhouse.rs` — WriterHealth, commit_with_retry, retry_with_backoff, InserterBatchSettings, configurable retention TTL, updated inserter worker
- `crates/evidence-collector/src/storage/mod.rs` — added `pub mod dead_letter`
- `crates/evidence-collector/src/merkle/persistence.rs` — new — persist/load/remove/recover anchor functions with hex serde
- `crates/evidence-collector/src/merkle/builder.rs` — MerkleAnchor extended with chain_hashes, Serialize/Deserialize, do_rotate rewritten for local-first persistence
- `crates/evidence-collector/src/merkle/mod.rs` — added `pub mod persistence`
- `crates/evidence-collector/src/storage/s3.rs` — verify_anchor updated for chain_hashes field
- `crates/evidence-collector/src/config.rs` — data_dir, ch_max_rows, ch_period_ms, ch_max_bytes fields with env var parsing
- `crates/evidence-collector/src/grpc/service.rs` — DeduplicationTracker with bounded capacity, dedup check in process_bundle
- `crates/evidence-collector/src/main.rs` — dead-letter/anchor dir creation, startup recovery, data_dir/batch settings wiring
- `crates/evidence-collector/tests/integration_test.rs` — updated table_ddl() call to table_ddl(2555)

## Forward Intelligence

### What the next slice should know
- `WriterHealth` is accessed via `ClickHouseWriter::health()` returning `Arc<WriterHealth>`. Load counters with `rows_written.load(Relaxed)`. S06 should expose these as `evidence_written_total`, `evidence_retried_total`, `evidence_dead_lettered_total` Prometheus counters.
- `MerkleAnchor.chain_hashes` contains the ordered leaf hashes from `finalize()`. S06's `proof_for_bundle()` should use this to generate inclusion proofs.
- The `upload_anchor_to_s3` function is `pub(crate)` and reusable — S06 shouldn't need to modify anchor upload logic.

### What's fragile
- `pending_rows` Vec in the inserter worker clones each `EvidenceRow` before writing to the inserter — memory doubles during the pending window. With large batches this could be significant, though the configurable `ch_max_rows` (default 1000) bounds it.
- Hex serde modules (`hex_array`, `hex_array_vec`) are defined in `builder.rs` — if other modules need hex byte serialization, they should be extracted to a shared utility.

### Authoritative diagnostics
- `{data_dir}/dead-letter/*.json` — accumulation here means ClickHouse is failing commits. Each file is a complete EvidenceRow in JSON.
- `{data_dir}/merkle-anchors/*.json` — accumulation here means S3 is unreachable. Each file is a MerkleAnchor with root, hour, bundle_count, chain_hashes.
- `WriterHealth` counters — `rows_dead_lettered > 0` is the primary alert signal for pipeline data loss risk.

### What assumptions changed
- Dead-letter JSON format works for all EvidenceRow field types — confirmed by roundtrip test. The milestone risk "JSON may be insufficient for binary proto fields" is retired.
- Corrupt anchor recovery works without panic — confirmed by 3 corruption test cases (truncated JSON, empty file, wrong extension). The milestone risk "must handle corrupted/partial files gracefully" is retired.
