---
id: T01
parent: S01
milestone: M009
provides:
  - WriterHealth struct with atomic counters for ClickHouse write observability
  - Dead-letter file spill for evidence rows on commit exhaustion
  - Exponential backoff retry (5 attempts) on ClickHouse commit failure
  - COLLECTOR_DATA_DIR config field threaded through main → writer
key_files:
  - crates/evidence-collector/src/storage/dead_letter.rs
  - crates/evidence-collector/src/storage/clickhouse.rs
  - crates/evidence-collector/src/config.rs
  - crates/evidence-collector/src/main.rs
  - crates/evidence-collector/src/storage/mod.rs
key_decisions:
  - retry_with_backoff extracted as #[cfg(test)] function taking FnMut closure for testability without ClickHouse
  - pending_rows Vec buffers rows since last successful commit for dead-lettering (inserter buffer may be lost)
  - WriterHealth uses Relaxed ordering — counters are monotonic stats, not synchronization
patterns_established:
  - Exponential backoff pattern: 200ms base, 2x multiplier, 5s cap, configurable MAX_RETRY_ATTEMPTS const
  - Dead-letter file naming: {timestamp_millis}-{bundle_id}.json in {data_dir}/dead-letter/
  - Health counter pattern: Arc<WriterHealth> on ClickHouseWriter accessible via health() method
observability_surfaces:
  - WriterHealth atomic counters (rows_written, rows_retried, rows_dead_lettered) exposed via ClickHouseWriter::health()
  - tracing::warn on each retry attempt with attempt number, max_attempts, backoff_ms, error
  - tracing::error on dead-letter file write with file path and bundle_id
  - tracing::info on successful retry with attempt number
  - Dead-letter JSON files in {data_dir}/dead-letter/ for manual inspection and replay
duration: 25min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: ClickHouse retry with exponential backoff, dead-letter spill, and WriterHealth counters

**Added 5-attempt exponential backoff retry on ClickHouse commit failure, dead-letter JSON file spill on exhaustion, and WriterHealth atomic counters for pipeline observability.**

## What Happened

Implemented all 8 steps from the task plan:

1. Added `data_dir: PathBuf` to `CollectorConfig` with `COLLECTOR_DATA_DIR` env var (default `/data/evidence-collector`).

2. Created `storage/dead_letter.rs` module with `dead_letter_dir()` and `write_dead_letter()` — serializes `EvidenceRow` to JSON in `{data_dir}/dead-letter/{timestamp_millis}-{bundle_id}.json` with `tracing::error` on write.

3. Created `WriterHealth` struct with three `AtomicU64` counters (`rows_written`, `rows_retried`, `rows_dead_lettered`) and `increment_*()` convenience methods. Uses `Relaxed` ordering (monotonic stats counters).

4. Updated `ClickHouseWriter` to hold `Arc<WriterHealth>` and `PathBuf` for `data_dir`. Added `health()` accessor for S06 consumption. Updated `new()` signature to accept `data_dir: PathBuf`.

5. Rewrote `run_inserter_worker` with retry-aware commit: maintains `pending_rows: Vec<EvidenceRow>` buffer, calls `commit_with_retry()` on each row, dead-letters all pending rows on exhaustion. Extracted `commit_with_retry()` as the production retry loop and `retry_with_backoff()` as a `#[cfg(test)]` testable version with closure.

6. Updated `main.rs` to create dead-letter directory at startup and pass `cfg.data_dir.clone()` to `ClickHouseWriter::new`.

7. Added unit tests: `dead_letter_roundtrip`, `dead_letter_creates_file_with_bundle_id`, `writer_health_counter_increments`.

8. Added retry logic tests: `retry_succeeds_on_first_attempt`, `retry_succeeds_after_failures` (fails twice then succeeds, verifies 3 total calls and 2 retries), `retry_exhaustion_creates_dead_letter` (always fails, verifies 6 total calls, 5 retries, 2 dead-letter files created with valid content).

## Verification

- `cargo test -p evidence-collector` — **66 unit tests + 7 integration tests pass** (all existing tests preserved, 7 new tests added)
- `cargo clippy --workspace --all-targets -- -D warnings` — **clean** (no warnings)
- `cargo fmt --all -- --check` — **clean** (no diffs)

### Slice-level verification checks (this task):
- ✅ Dead-letter roundtrip test: creates file from EvidenceRow, reads back, verifies field equality
- ✅ Retry logic test: simulates commit failures via callback, verifies 5 retry attempts with backoff, dead-letter on exhaustion
- ✅ WriterHealth test: verifies counters increment correctly on write/retry/dead-letter
- ✅ Config test: `data_dir` defaults to `/data/evidence-collector`, parsed from env
- ⏳ Merkle persistence test (T02)
- ⏳ Corrupt anchor test (T02)
- ⏳ Startup recovery test (T02)
- ⏳ chain_hashes test (T02)
- ⏳ TTL test (T03)
- ⏳ Dedup test (T03)
- ⏳ Config test for ch_max_rows, ch_period_ms, ch_max_bytes (T03)

## Diagnostics

- **WriterHealth counters**: Read `ClickHouseWriter::health()` to get `Arc<WriterHealth>`. Load counters with `rows_written.load(Relaxed)`, etc. S06 will expose these as Prometheus metrics.
- **Dead-letter files**: List `{data_dir}/dead-letter/*.json` for failed rows. Each file is a complete `EvidenceRow` in JSON, suitable for manual replay or forensic inspection.
- **Structured logs**: `tracing::warn` on each retry (includes attempt number, backoff_ms, error), `tracing::error` on dead-letter write (includes file path, bundle_id), `tracing::info` on successful retry.

## Deviations

- Plan step 5 mentions keeping a `Vec<EvidenceRow>` of rows since last successful commit and dead-lettering all of them on exhaustion. Implemented exactly as specified — `pending_rows` is cleared on success and all rows are dead-lettered on exhaustion.
- The `retry_with_backoff` function was marked `#[cfg(test)]` rather than `pub(crate)` to avoid the `dead_code` warning, since it's only used in tests. The production path uses `commit_with_retry` which operates on the real `Inserter`.

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/src/storage/dead_letter.rs` — **new** — dead-letter directory helper and async write function with tests
- `crates/evidence-collector/src/storage/clickhouse.rs` — added `WriterHealth`, `commit_with_retry`, `retry_with_backoff`, updated `ClickHouseWriter` and `run_inserter_worker` with retry loop, added 4 new tests
- `crates/evidence-collector/src/storage/mod.rs` — added `pub mod dead_letter;`
- `crates/evidence-collector/src/config.rs` — added `data_dir: PathBuf` field with `COLLECTOR_DATA_DIR` env var parsing and default
- `crates/evidence-collector/src/main.rs` — added dead-letter directory creation at startup, passed `data_dir` to `ClickHouseWriter::new`
