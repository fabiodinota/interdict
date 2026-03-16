---
id: T03
parent: S01
milestone: M009
provides:
  - Configurable ClickHouse retention TTL via `table_ddl(retention_days)` — no more hardcoded `7 YEAR`
  - Configurable inserter batch settings via `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES` env vars
  - Bundle-ID deduplication via bounded `DeduplicationTracker` (100K capacity, insertion-order eviction)
  - `InserterBatchSettings` struct grouping inserter configuration
key_files:
  - crates/evidence-collector/src/storage/clickhouse.rs
  - crates/evidence-collector/src/config.rs
  - crates/evidence-collector/src/grpc/service.rs
  - crates/evidence-collector/src/main.rs
  - crates/evidence-collector/tests/integration_test.rs
key_decisions:
  - "D064: InserterBatchSettings struct to avoid clippy too_many_arguments"
  - "D065: Insertion-order (FIFO) eviction for DeduplicationTracker — simpler than true LRU, acceptable for rare duplicate scenario"
patterns_established:
  - "Bounded in-memory dedup: HashMap + VecDeque with FIFO eviction at capacity"
  - "Config struct grouping: InserterBatchSettings bundles related inserter params to avoid argument sprawl"
observability_surfaces:
  - "tracing::warn on duplicate bundle_id rejection (includes bundle_id, kernel_id)"
  - "ClickHouse DDL TTL reflects configured retention_days — inspectable via SHOW CREATE TABLE"
  - "Batch settings configurable via env vars (no runtime log — constructor-time values)"
duration: 30m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Configurable retention TTL, inserter batch settings, and bundle-ID deduplication

**Parameterized ClickHouse DDL retention, added configurable inserter batch settings, and implemented bounded bundle-ID deduplication with FIFO eviction**

## What Happened

Three independent hardening changes shipped:

1. **Retention TTL**: `table_ddl()` now accepts `retention_days: u32` and interpolates `INTERVAL {retention_days} DAY DELETE` instead of the hardcoded `7 YEAR`. The `initialize_schema` and `ClickHouseWriter::new` signatures were updated to thread `retention_days` from config. Integration test call site updated.

2. **Inserter batch settings**: Added `ch_max_rows` (default 1000), `ch_period_ms` (default 1000), `ch_max_bytes` (default 52,428,800) to `CollectorConfig` with env var parsing. Introduced `InserterBatchSettings` struct to group these three values and avoid clippy `too_many_arguments` lint on `ClickHouseWriter::new`. The inserter construction now uses configurable values instead of hardcoded ones.

3. **Bundle-ID deduplication**: Added `DeduplicationTracker` struct in `grpc/service.rs` with `HashMap<String, ()>` for O(1) lookup and `VecDeque<String>` for insertion-order eviction at 100K capacity. The `process_bundle` method acquires a `Mutex<DeduplicationTracker>` lock and rejects duplicates before any processing. Duplicate rejection is logged with `tracing::warn`.

## Verification

- `cargo fmt --all -- --check` — clean ✅
- `cargo clippy --workspace --all-targets -- -D warnings` — clean ✅
- `cargo test -p evidence-collector` — 79 unit tests passed ✅
- `cargo test -p evidence-collector --test integration_test` — 7 integration tests passed ✅

### Slice-level verification (S01 final task — all must pass):
- ✅ Dead-letter roundtrip test (T01)
- ✅ Retry logic test: 5 attempts with backoff, dead-letter on exhaustion (T01)
- ✅ WriterHealth test: counters increment on write/retry/dead-letter (T01)
- ✅ Merkle persistence test: persist/load/remove roundtrip (T02)
- ✅ Corrupt anchor test: truncated/invalid files skipped without panic (T02)
- ✅ Startup recovery test: pending anchor files processed (T02)
- ✅ `chain_hashes` test: `finalize()` populates matching input leaves (T02)
- ✅ TTL test: `table_ddl(30)` contains `INTERVAL 30 DAY DELETE` (T03)
- ✅ Dedup test: duplicate bundle_id rejected, unique accepted, eviction at capacity (T03)
- ✅ Config test: env var parsing for `data_dir`, `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` (T03)

## Diagnostics

- **Duplicate rejections**: Search structured logs for `"rejected duplicate bundle_id"` — includes `bundle_id` and `kernel_id` fields.
- **Retention policy**: Run `SHOW CREATE TABLE evidence_bundles` in ClickHouse to see the active TTL interval.
- **Batch settings**: Inspect `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES` env vars. Defaults: 1000 rows, 1000ms period, 50 MiB bytes.
- **Dedup capacity**: Fixed at 100K entries (const `DEDUP_CAPACITY`). No runtime metric exposed — S06 can add if needed.

## Deviations

- **`InserterBatchSettings` struct**: Plan called for passing `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` as individual parameters. Introduced a struct instead to satisfy clippy `too_many_arguments` lint (D064).
- **FIFO eviction instead of LRU**: Plan suggested LRU eviction. Used simpler insertion-order (FIFO) eviction — duplicate re-submissions don't refresh position. Acceptable because duplicates are rare and 100K capacity is generous (D065).
- **`process_bundle` error path**: Plan specified `Err(tonic::Status::already_exists(...))`. Implementation returns `Err(anyhow!("duplicate bundle_id"))` which is caught by the existing `submit_evidence` error handler and counted in `rejected_count`. This is correct for the streaming gRPC pattern where individual bundle errors increment `rejected_count` rather than terminating the stream.

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/src/storage/clickhouse.rs` — `table_ddl(retention_days: u32)`, `InserterBatchSettings` struct, configurable inserter, updated DDL tests
- `crates/evidence-collector/src/config.rs` — `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` fields with env var parsing, `config_batch_settings_from_env` and `config_data_dir_from_env` tests
- `crates/evidence-collector/src/grpc/service.rs` — `DeduplicationTracker` struct with bounded capacity, dedup check in `process_bundle`, 3 dedup tests
- `crates/evidence-collector/src/main.rs` — passes `retention_days` and `InserterBatchSettings` to writer
- `crates/evidence-collector/tests/integration_test.rs` — updated `table_ddl()` call to `table_ddl(2555)`
