---
estimated_steps: 8
estimated_files: 5
---

# T01: ClickHouse retry with exponential backoff, dead-letter spill, and WriterHealth counters

**Slice:** S01 — Evidence Pipeline Resilience
**Milestone:** M009

## Description

The ClickHouse inserter worker (`run_inserter_worker` in `storage/clickhouse.rs`) silently drops rows when `commit()` fails — it logs an error and continues. This task adds exponential backoff retry (5 attempts), dead-letter file spill on exhaustion, and `WriterHealth` atomic counters so the pipeline is resilient and observable.

## Steps

1. **Add `data_dir` to `CollectorConfig`** — In `config.rs`, add `pub data_dir: PathBuf` field with env var `COLLECTOR_DATA_DIR` (default `/data/evidence-collector`). Parse in `from_env()`.

2. **Create `storage/dead_letter.rs` module** — Implement:
   - `pub fn dead_letter_dir(data_dir: &Path) -> PathBuf` → `{data_dir}/dead-letter/`
   - `pub async fn write_dead_letter(data_dir: &Path, bundle_id: &str, row: &EvidenceRow) -> Result<()>` → serialize `EvidenceRow` to JSON, write to `{data_dir}/dead-letter/{timestamp_millis}-{bundle_id}.json`. Use `chrono::Utc::now().timestamp_millis()` for uniqueness. Log the file path at `tracing::error` level.
   - Add `pub mod dead_letter;` to `storage/mod.rs`.

3. **Create `WriterHealth` struct** — In `storage/clickhouse.rs` (or a new `storage/health.rs`), add:
   ```rust
   pub struct WriterHealth {
       pub rows_written: AtomicU64,
       pub rows_retried: AtomicU64,
       pub rows_dead_lettered: AtomicU64,
   }
   ```
   With `new()` and `increment_*()` convenience methods. This struct is `Send + Sync` (atomics are).

4. **Modify `ClickHouseWriter`** — Add `health: Arc<WriterHealth>` field and `data_dir: PathBuf` field. Expose `pub fn health(&self) -> &Arc<WriterHealth>`. Pass both into `run_inserter_worker`.

5. **Implement retry loop in `run_inserter_worker`** — Replace the current `commit()` error handling:
   ```
   On commit() failure:
     for attempt in 1..=5:
       backoff = min(200ms * 2^(attempt-1), 5000ms)
       tracing::warn!(attempt, error, "retrying ClickHouse commit")
       health.rows_retried.fetch_add(1, Relaxed)
       tokio::time::sleep(backoff).await
       try commit() again
       if success: break
     if all 5 failed:
       health.rows_dead_lettered.fetch_add(1, Relaxed)
       write_dead_letter(data_dir, bundle_id, &row).await
   On commit() success:
     health.rows_written.fetch_add(1, Relaxed)
   ```
   **Important:** The worker is async, so `tokio::time::sleep` won't block the tokio runtime. However, it does block the channel receiver — this is acceptable since a failing ClickHouse should back-pressure writes. The `EvidenceRow` must be captured before the `write()` call (it's moved into the inserter). Clone it or keep a reference for dead-lettering.
   
   **Note on `commit()` semantics:** The `clickhouse` 0.14 crate's `Inserter::commit()` flushes pending rows. After a failed `commit()`, the rows may be lost from the internal buffer. The retry calls `commit()` again (which may be a no-op if the buffer is empty). The dead-letter file is the safety net — it captures the row *before* it enters the inserter's buffer. Approach: keep a `Vec<EvidenceRow>` of rows written since last successful commit, and dead-letter all of them on exhaustion.

6. **Update `main.rs`** — Create dead-letter directory at startup: `tokio::fs::create_dir_all(dead_letter_dir(&cfg.data_dir)).await?`. Pass `cfg.data_dir` and `WriterHealth` to `ClickHouseWriter::new`.

7. **Add unit tests** — In `storage/dead_letter.rs` (`#[cfg(test)]`):
   - `dead_letter_roundtrip`: write an `EvidenceRow` as dead-letter, read the file back, deserialize, verify all fields match.
   - `dead_letter_creates_file_with_bundle_id`: verify filename contains the bundle_id.
   
   In `storage/clickhouse.rs` (`#[cfg(test)]`):
   - `writer_health_counter_increments`: create `WriterHealth`, call increment methods, verify counts.

8. **Add retry logic test** — Extract the retry-with-backoff logic into a testable async function that takes a `commit` closure (or `FnMut`). Test with a closure that fails N times then succeeds, verifying: (a) correct number of attempts, (b) dead-letter file created on exhaustion, (c) health counters accurate.

## Must-Haves

- [ ] `COLLECTOR_DATA_DIR` env var parsed in `CollectorConfig`
- [ ] Dead-letter JSON files written to `{data_dir}/dead-letter/` with `EvidenceRow` content
- [ ] 5-attempt exponential backoff (200ms base, 2x multiplier, 5s cap) on `commit()` failure
- [ ] `WriterHealth` with atomic `rows_written`, `rows_retried`, `rows_dead_lettered` counters
- [ ] `WriterHealth` exposed via `ClickHouseWriter::health()` for S06 consumption
- [ ] Dead-letter directory created at startup in `main.rs`
- [ ] All new and existing tests pass

## Verification

- `cargo test -p evidence-collector` — all tests pass including new dead-letter, health, and retry tests
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

## Observability Impact

- Signals added: `tracing::warn` on each retry attempt (attempt number, error), `tracing::error` on dead-letter write (file path, bundle_id)
- How a future agent inspects this: read `WriterHealth` counters (S06 exposes as Prometheus metrics); list files in `{data_dir}/dead-letter/`
- Failure state exposed: retry count per commit, dead-letter file count, last error message in structured log

## Inputs

- `crates/evidence-collector/src/storage/clickhouse.rs` — current `run_inserter_worker` with silent error handling, `EvidenceRow` struct with `Serialize + Deserialize`
- `crates/evidence-collector/src/config.rs` — current `CollectorConfig` with `retention_days` but no `data_dir`
- `crates/evidence-collector/src/main.rs` — current wiring that creates `ClickHouseWriter` without `data_dir`
- The existing `evidence_row_serialization_roundtrip` test proves JSON roundtrip works for `EvidenceRow`

## Expected Output

- `crates/evidence-collector/src/storage/dead_letter.rs` — new module with `write_dead_letter`, `dead_letter_dir`, and tests
- `crates/evidence-collector/src/storage/clickhouse.rs` — `run_inserter_worker` with retry loop, `WriterHealth` struct, updated `ClickHouseWriter` with health/data_dir fields
- `crates/evidence-collector/src/storage/mod.rs` — `pub mod dead_letter;` added
- `crates/evidence-collector/src/config.rs` — `data_dir: PathBuf` field added
- `crates/evidence-collector/src/main.rs` — dead-letter dir creation, `data_dir` passed to writer
