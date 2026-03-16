# S01: Evidence Pipeline Resilience

**Goal:** ClickHouse writes retry with exponential backoff (5 attempts) and spill to dead-letter files on exhaustion. S3 Merkle anchors are persisted locally before tree reset, with retry (3 attempts) and startup recovery of pending anchors. ClickHouse retention TTL uses configured `retention_days`. Bundle ID duplicates are rejected. Inserter batch settings are configurable via env vars. `cargo test -p evidence-collector` passes with all new tests.

**Demo:** Simulated ClickHouse commit failure triggers 5 retries with exponential backoff, then writes a dead-letter JSON file. Merkle anchor is persisted locally before S3 upload; startup recovery re-attempts pending anchors. `WriterHealth` counters track rows written, retried, and dead-lettered. `table_ddl()` interpolates configured `retention_days`. Duplicate `bundle_id` values are rejected. Inserter batch settings read from env vars.

## Must-Haves

- Exponential backoff retry (5 attempts, base 200ms, max 5s) on `inserter.commit()` failure
- Dead-letter JSON files written to `{data_dir}/dead-letter/` on retry exhaustion
- `WriterHealth` struct with atomic counters: `rows_written`, `rows_retried`, `rows_dead_lettered`
- Merkle anchor persisted to `{data_dir}/merkle-anchors/{hour}.json` before tree reset
- S3 upload retried 3 times with backoff; local file deleted only after S3 confirms
- Startup recovery scan of pending anchor files with re-attempt of S3 upload
- `MerkleAnchor.chain_hashes: Vec<[u8; 32]>` populated from `leaf_hashes` in `finalize()`
- `table_ddl()` accepts `retention_days` and interpolates `INTERVAL {days} DAY DELETE`
- Bundle-ID deduplication via bounded in-memory set (100K cap) in `process_bundle`
- Configurable batch settings via `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES`
- `COLLECTOR_DATA_DIR` env var (default `/data/evidence-collector`)

## Proof Level

- This slice proves: contract + operational
- Real runtime required: no (all tests use filesystem or mock patterns — no ClickHouse/S3 in CI)
- Human/UAT required: no

## Verification

- `cargo test -p evidence-collector` — all new and existing tests pass
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- Dead-letter roundtrip test: create dead-letter file from `EvidenceRow`, read back, verify field equality
- Retry logic test: simulate commit failures via callback, verify 5 attempts with backoff, dead-letter on exhaustion
- WriterHealth test: verify counters increment correctly on write/retry/dead-letter
- Merkle persistence test: persist anchor, load pending, verify content, remove after "success"
- Corrupt anchor test: truncated/invalid JSON files logged and skipped without panic
- Startup recovery test: create pending anchor files, run recovery, verify processing
- `chain_hashes` test: verify `finalize()` populates `chain_hashes` matching input leaves
- TTL test: `table_ddl_with_retention(30)` contains `INTERVAL 30 DAY DELETE`
- Dedup test: second `process_bundle` with same `bundle_id` returns error
- Config test: env var parsing for `data_dir`, `ch_max_rows`, `ch_period_ms`, `ch_max_bytes`

## Observability / Diagnostics

- Runtime signals: `tracing::warn` on each retry attempt (attempt number, error, bundle_id), `tracing::error` on dead-letter write, `tracing::info` on successful retry, `tracing::warn` on corrupt anchor file skip, `tracing::info` on startup recovery progress
- Inspection surfaces: `WriterHealth` struct (atomic counters) readable by S06's Prometheus metrics; dead-letter files in `{data_dir}/dead-letter/`; pending anchor files in `{data_dir}/merkle-anchors/`
- Failure visibility: retry count, last error message, dead-letter file path, anchor persistence path
- Redaction constraints: none (evidence rows in dead-letter files contain hashed/encrypted content, not plaintext)

## Integration Closure

- Upstream surfaces consumed: none (independent slice)
- New wiring introduced: `data_dir` threaded from config → main → writer + merkle persistence; `WriterHealth` exposed on `ClickHouseWriter` for S06 consumption; `MerkleAnchor.chain_hashes` available for S06's `proof_for_bundle()`
- What remains before the milestone is truly usable end-to-end: S06 wires `WriterHealth` to Prometheus metrics and uses `chain_hashes` for proof generation

## Tasks

- [x] **T01: ClickHouse retry with exponential backoff, dead-letter spill, and WriterHealth counters** `est:2h`
  - Why: The inserter worker silently drops rows on `commit()` failure. This task adds retry with backoff, dead-letter file spill on exhaustion, and health counters — the core data-path resilience required by FH-INTEGRITY-01.
  - Files: `crates/evidence-collector/src/storage/dead_letter.rs` (new), `crates/evidence-collector/src/storage/clickhouse.rs`, `crates/evidence-collector/src/storage/mod.rs`, `crates/evidence-collector/src/config.rs`, `crates/evidence-collector/src/main.rs`
  - Do: (1) Add `data_dir` field to `CollectorConfig` with `COLLECTOR_DATA_DIR` env var (default `/data/evidence-collector`). (2) Create `storage/dead_letter.rs` module with `write_dead_letter(data_dir, bundle_id, row)` that serializes `EvidenceRow` to `{data_dir}/dead-letter/{timestamp}-{bundle_id}.json`. (3) Create `WriterHealth` struct with `AtomicU64` counters for `rows_written`, `rows_retried`, `rows_dead_lettered` and `increment_*()` methods. (4) Modify `run_inserter_worker` to retry `commit()` 5 times with exponential backoff (200ms base, 2x multiplier, 5s cap) using `tokio::time::sleep`, invoke dead-letter writer on exhaustion, increment WriterHealth counters. (5) Expose `WriterHealth` on `ClickHouseWriter` (pub field or accessor). (6) In `main.rs`, create dead-letter directory at startup via `tokio::fs::create_dir_all`. (7) Add unit tests: dead-letter roundtrip, WriterHealth counter increments. (8) Add retry logic test using extracted testable function with closure/callback pattern.
  - Verify: `cargo test -p evidence-collector` passes with new tests; `cargo clippy --workspace --all-targets -- -D warnings` clean
  - Done when: `WriterHealth` counters exist and are incremented, dead-letter files are written on retry exhaustion, retry uses async exponential backoff with 5 attempts

- [ ] **T02: Merkle anchor local persistence, S3 retry, startup recovery, and chain_hashes** `est:2h`
  - Why: The current `do_rotate` resets the builder before confirming S3 — anchor is lost on S3 failure. This task persists anchors locally first, retries S3, recovers pending anchors on startup, and extends `MerkleAnchor` with `chain_hashes` for S06's proof generation.
  - Files: `crates/evidence-collector/src/merkle/persistence.rs` (new), `crates/evidence-collector/src/merkle/builder.rs`, `crates/evidence-collector/src/merkle/mod.rs`, `crates/evidence-collector/src/storage/s3.rs`, `crates/evidence-collector/src/main.rs`
  - Do: (1) Extend `MerkleAnchor` with `chain_hashes: Vec<[u8; 32]>` field. In `finalize()`, clone `self.leaf_hashes` into the anchor's `chain_hashes` before returning. (2) Create `merkle/persistence.rs` with: `persist_anchor(data_dir, anchor) -> Result<PathBuf>` (writes JSON to `{data_dir}/merkle-anchors/{hour_formatted}.json`), `load_pending_anchors(data_dir) -> Vec<(PathBuf, MerkleAnchor)>` (scans directory, skips corrupt files with `tracing::warn`), `remove_anchor(path) -> Result<()>`. (3) Modify `do_rotate`: persist anchor locally before calling `guard.reset()`, then attempt S3 upload with 3 retries (backoff 500ms base), delete local file only on S3 success. (4) Add `recover_pending_anchors(data_dir, s3_anchor)` async function in `main.rs` or persistence module — scans pending anchors, re-attempts S3, deletes on success. Call from `main()` after S3Anchor init. (5) Derive `Serialize + Deserialize` on `MerkleAnchor`; use hex-encoded strings for `root` and `chain_hashes` byte arrays in JSON. (6) Add unit tests: persist/load/remove roundtrip, corrupt file handling (truncated JSON, empty file, wrong schema), `chain_hashes` populated correctly in `finalize()`.
  - Verify: `cargo test -p evidence-collector` passes with new tests; `cargo clippy --workspace --all-targets -- -D warnings` clean
  - Done when: anchors survive S3 failure (local file persists), startup recovery processes pending anchors, corrupt files don't panic, `chain_hashes` matches input leaf hashes

- [ ] **T03: Configurable retention TTL, inserter batch settings, and bundle-ID deduplication** `est:1h`
  - Why: TTL is hardcoded to 7 years instead of using `config.retention_days`, batch settings are hardcoded with no env override, and duplicate bundles are silently accepted. These are three small, independent hardening changes that close the remaining FH-INTEGRITY-01 gaps.
  - Files: `crates/evidence-collector/src/storage/clickhouse.rs`, `crates/evidence-collector/src/config.rs`, `crates/evidence-collector/src/grpc/service.rs`, `crates/evidence-collector/src/main.rs`
  - Do: (1) Change `table_ddl()` to `table_ddl(retention_days: u32)` — interpolate `INTERVAL {retention_days} DAY DELETE` replacing the hardcoded `7 YEAR`. Update `initialize_schema` to pass `retention_days`. Update existing DDL test to use parameterized call. (2) Add `ch_max_rows`, `ch_period_ms`, `ch_max_bytes` fields to `CollectorConfig` with env vars `COLLECTOR_CH_MAX_ROWS` (default 1000), `COLLECTOR_CH_PERIOD_MS` (default 1000), `COLLECTOR_CH_MAX_BYTES` (default 52428800). Pass to `ClickHouseWriter::new` and use in inserter construction. (3) Add `DeduplicationTracker` struct in `grpc/service.rs` (or new `grpc/dedup.rs`): wraps a `HashMap<String, Instant>` or `Vec` bounded to 100K entries with LRU eviction. Add `track(&mut self, bundle_id) -> bool` returning false for duplicates. Wire into `EvidenceCollectorGrpcService` and call in `process_bundle` before processing — return `Status::already_exists` for duplicates. (4) Add tests: DDL with custom retention days, dedup acceptance/rejection, dedup eviction at capacity, config env var parsing for new fields.
  - Verify: `cargo test -p evidence-collector` passes with new tests; existing 7 integration tests still pass; `cargo clippy --workspace --all-targets -- -D warnings` clean
  - Done when: `table_ddl(30)` produces `INTERVAL 30 DAY DELETE`, batch settings are read from env, duplicate `bundle_id` returns `ALREADY_EXISTS` gRPC status

## Files Likely Touched

- `crates/evidence-collector/src/storage/dead_letter.rs` (new)
- `crates/evidence-collector/src/storage/clickhouse.rs`
- `crates/evidence-collector/src/storage/mod.rs`
- `crates/evidence-collector/src/merkle/persistence.rs` (new)
- `crates/evidence-collector/src/merkle/builder.rs`
- `crates/evidence-collector/src/merkle/mod.rs`
- `crates/evidence-collector/src/storage/s3.rs`
- `crates/evidence-collector/src/config.rs`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/evidence-collector/src/main.rs`
