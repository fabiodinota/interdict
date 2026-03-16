---
estimated_steps: 4
estimated_files: 4
---

# T03: Configurable retention TTL, inserter batch settings, and bundle-ID deduplication

**Slice:** S01 — Evidence Pipeline Resilience
**Milestone:** M009

## Description

Three small, independent hardening changes: (1) ClickHouse DDL uses configured `retention_days` instead of hardcoded `7 YEAR`, (2) inserter batch settings are configurable via env vars, (3) duplicate `bundle_id` values are rejected in `process_bundle`. Each is 10-30 lines of implementation with tests.

## Steps

1. **Parameterize `table_ddl()` with `retention_days`** — In `storage/clickhouse.rs`:
   - Change `pub fn table_ddl() -> String` to `pub fn table_ddl(retention_days: u32) -> String`.
   - Replace `TTL event_date + INTERVAL 7 YEAR DELETE` with `TTL event_date + INTERVAL {retention_days} DAY DELETE` using `format!()`. This is safe because `retention_days` is `u32` (no injection risk).
   - Update `initialize_schema` to accept `retention_days` and pass it to `table_ddl()`.
   - Update `ClickHouseWriter::new` to accept `retention_days` and pass to `initialize_schema`.
   - Update all call sites in `main.rs` to pass `cfg.retention_days`.
   - Update the existing DDL test (currently asserts `7 YEAR`) to: (a) call `table_ddl(2555)` and assert `INTERVAL 2555 DAY DELETE`, (b) call `table_ddl(30)` and assert `INTERVAL 30 DAY DELETE`.

2. **Add configurable inserter batch settings** — In `config.rs`:
   - Add fields: `pub ch_max_rows: u64` (default 1000), `pub ch_period_ms: u64` (default 1000), `pub ch_max_bytes: u64` (default 52_428_800).
   - Parse from `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES` env vars.
   - In `storage/clickhouse.rs`, update `ClickHouseWriter::new` to accept these three values.
   - In the inserter construction (currently `.inserter::<EvidenceRow>(EVIDENCE_TABLE)?` with hardcoded `.with_max_rows(1000)` etc.), use the configurable values.
   - Update `main.rs` to pass `cfg.ch_max_rows`, `cfg.ch_period_ms`, `cfg.ch_max_bytes`.
   - Add config test: set env vars, parse config, verify values.

3. **Add bundle-ID deduplication** — In `grpc/service.rs`:
   - Create a `DeduplicationTracker` struct:
     ```rust
     struct DeduplicationTracker {
         seen: HashMap<String, ()>,  // or Vec<String> with index
         order: VecDeque<String>,    // for LRU eviction
         capacity: usize,           // 100_000
     }
     ```
   - Implement `pub fn check_and_track(&mut self, bundle_id: &str) -> bool` — returns `true` if new (not seen), `false` if duplicate. On capacity overflow, evict the oldest entry.
   - Add `dedup: Arc<Mutex<DeduplicationTracker>>` to `EvidenceCollectorGrpcService`.
   - In `process_bundle`, at the top: acquire lock, call `check_and_track(&bundle.bundle_id)`. If duplicate, return `Err(tonic::Status::already_exists("duplicate bundle_id"))`.
   - Update `EvidenceCollectorGrpcService::new` to initialize the dedup tracker.
   - Update `main.rs` — no changes needed since `new()` handles initialization internally.

4. **Add tests** — In `grpc/service.rs` (`#[cfg(test)]`):
   - `dedup_rejects_duplicate`: track a bundle_id, verify second call returns false.
   - `dedup_accepts_unique`: track two different bundle_ids, both return true.
   - `dedup_evicts_at_capacity`: create tracker with capacity 2, add 3 items, verify first is evicted (third call with first id returns true again).
   
   In `config.rs` (`#[cfg(test)]`):
   - `config_batch_settings_from_env`: set env vars, parse, verify `ch_max_rows`, `ch_period_ms`, `ch_max_bytes`.
   - `config_data_dir_from_env`: set `COLLECTOR_DATA_DIR`, parse, verify value.

## Must-Haves

- [ ] `table_ddl(retention_days)` interpolates configured value — no hardcoded `7 YEAR`
- [ ] `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` read from env vars with sane defaults
- [ ] `DeduplicationTracker` with bounded capacity (100K) and LRU eviction
- [ ] Duplicate `bundle_id` returns `tonic::Status::already_exists`
- [ ] All new and existing tests pass (including the 7 integration tests)

## Verification

- `cargo test -p evidence-collector` — all tests pass
- `cargo test -p evidence-collector --test integration_test` — existing 7 tests still pass
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

## Inputs

- `crates/evidence-collector/src/storage/clickhouse.rs` — current `table_ddl()` with hardcoded TTL, `ClickHouseWriter::new` with hardcoded batch settings
- `crates/evidence-collector/src/config.rs` — `CollectorConfig` with `retention_days` field (and `data_dir` added by T01), no batch settings
- `crates/evidence-collector/src/grpc/service.rs` — `process_bundle` accepts any `bundle_id`, `EvidenceCollectorGrpcService::new` takes 5 params
- `crates/evidence-collector/src/main.rs` — current wiring passing config to writer and service (updated by T01/T02 with `data_dir`)

## Expected Output

- `crates/evidence-collector/src/storage/clickhouse.rs` — `table_ddl(retention_days: u32)`, configurable inserter batch settings, updated tests
- `crates/evidence-collector/src/config.rs` — `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` fields with env var parsing and tests
- `crates/evidence-collector/src/grpc/service.rs` — `DeduplicationTracker` struct, dedup check in `process_bundle`, dedup tests
- `crates/evidence-collector/src/main.rs` — pass `retention_days` and batch settings to writer

## Observability Impact

- **Structured log on duplicate rejection**: `tracing::warn` with `bundle_id` and `kernel_id` when a duplicate `bundle_id` is rejected in `process_bundle`. Searchable in log aggregation by `bundle_id` field.
- **ClickHouse DDL TTL**: The `table_ddl()` output now reflects the configured `retention_days` value. Inspect via `SHOW CREATE TABLE evidence_bundles` in ClickHouse to verify the active retention policy.
- **Batch settings visibility**: `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` are configurable via env vars. No runtime log emitted for these (they are constructor-time settings). Verify by inspecting `CollectorConfig` in startup logs or env var audit.
- **Failure state**: Duplicate `bundle_id` submissions are rejected and counted in the `rejected_count` field of the `SubmitEvidenceResponse`. The caller sees the rejection in the gRPC response, but individual duplicate errors are not surfaced via `Status::already_exists` at the gRPC streaming level — they increment `rejected_count` in the batch response.
