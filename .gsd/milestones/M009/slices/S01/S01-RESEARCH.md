# S01 (Evidence Pipeline Resilience) — Research

**Date:** 2026-03-16

## Summary

S01 addresses the most critical data-path gaps: the ClickHouse inserter worker silently drops rows on failure (`tracing::error` then `continue`), the Merkle rotation writes to S3 with no retry and no local persistence (tree is reset *before* the anchor is durably stored), the DDL hardcodes `TTL event_date + INTERVAL 7 YEAR DELETE` instead of using `config.retention_days`, there is no bundle-ID deduplication, and the inserter batch settings (`max_rows=1000`, `period=1s`, `max_bytes=50MB`) are hardcoded with no env-var override. None of these features (retry, dead-letter, local persistence, dedup, configurable batch settings) exist yet — the slice is 100% greenfield logic layered onto existing code.

The codebase is clean and well-structured. The `run_inserter_worker` loop is the sole write path; retry and dead-letter logic belong entirely inside this function plus a new dead-letter file writer. The Merkle persistence goes into `do_rotate` (in `merkle/builder.rs`) plus a new local-persistence module and a startup recovery scan in `main.rs`. The `EvidenceCollectorGrpcService::process_bundle` method in `grpc/service.rs` is where bundle-ID dedup tracking belongs. All changes are confined to the `evidence-collector` crate.

## Recommendation

Implement six independent changes, testable in isolation:

1. **ClickHouse retry + dead-letter** — Add exponential backoff (5 attempts, base 200ms, max 5s) to `run_inserter_worker`'s `commit()` failure path. On exhaustion, serialize the `EvidenceRow` to a JSON file under `{data_dir}/dead-letter/{timestamp}-{bundle_id}.json`. The existing `serde_json` roundtrip test already proves all `EvidenceRow` fields survive JSON serialization. Expose `WriterHealth` counters (atomic u64s) on the writer for S06's Prometheus metrics.

2. **Merkle anchor local persistence** — Before resetting the builder in `do_rotate`, serialize the anchor + leaf hashes (the `chain_hashes` field S06 needs for proofs) to `{data_dir}/merkle-anchors/{hour}.json`. Retry S3 upload 3 times with backoff. Delete the local file only after S3 confirms. On startup (`main.rs`), scan the directory for pending anchors and re-attempt S3 upload.

3. **Configurable retention TTL** — Change `table_ddl()` to accept `retention_days: u32` and interpolate `INTERVAL {days} DAY DELETE`. The existing `initialize_schema` call site passes `cfg.retention_days`.

4. **Bundle-ID deduplication** — Add a `HashSet<String>` (bounded, per-kernel) to `EvidenceCollectorGrpcService` (or a new `DeduplicationTracker` struct). Reject bundles whose `bundle_id` was already seen within the current process lifetime. This is an in-memory best-effort guard — ClickHouse's `ReplacingMergeTree` is not used, and persistent dedup is out of scope.

5. **Configurable inserter batch settings** — Read `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES` from env in `CollectorConfig`, pass to `ClickHouseWriter::new`.

6. **MerkleAnchor `chain_hashes` field** — Extend `MerkleAnchor` with `chain_hashes: Vec<[u8; 32]>` populated from `leaf_hashes` during `finalize()`. This is the S06 boundary contract — S06 uses it for `proof_for_bundle()`.

## Implementation Landscape

### Key Files

- `crates/evidence-collector/src/storage/clickhouse.rs` — `run_inserter_worker` is the sole ClickHouse write path. `commit()` failures are logged and silently continued. `table_ddl()` hardcodes `7 YEAR` TTL. `ClickHouseWriter::new` hardcodes batch settings. `EvidenceRow` already derives `Serialize + Deserialize` with a proven JSON roundtrip test.
- `crates/evidence-collector/src/merkle/builder.rs` — `do_rotate` finalizes the tree, resets the builder, drops the lock, then attempts S3 — the anchor is lost if S3 fails. `HourlyMerkleBuilder::finalize()` returns `MerkleAnchor` which currently has only `root`, `bundle_count`, `hour` — needs `chain_hashes` for S06 proof generation. `leaf_hashes` is private; `finalize` must clone/drain it into the anchor.
- `crates/evidence-collector/src/storage/s3.rs` — `S3Anchor::anchor_merkle_root` does a single `put_object` with no retry. No local persistence.
- `crates/evidence-collector/src/config.rs` — `CollectorConfig` has `retention_days: u32` (default 2555) but no fields for `data_dir`, `ch_max_rows`, `ch_period_ms`, `ch_max_bytes`. Needs these 4 new fields.
- `crates/evidence-collector/src/grpc/service.rs` — `EvidenceCollectorGrpcService::process_bundle` accepts any `bundle_id` without dedup checking. The service struct holds `Arc<Mutex<...>>` references; dedup tracker fits naturally here.
- `crates/evidence-collector/src/main.rs` — Wires everything together. Needs: pass batch settings to writer, pass `data_dir` to writer and merkle persistence, run startup anchor recovery scan.
- `crates/evidence-collector/tests/integration_test.rs` — Existing 7-test integration suite. New tests for retry/dead-letter and anchor persistence go here or in unit test modules.

### Build Order

1. **`WriterHealth` counters + dead-letter file writer (new module)** — Build and test in isolation. Pure file I/O, no ClickHouse dependency. Test: create a dead-letter file, read it back, verify `EvidenceRow` roundtrip. This unblocks S06 (Prometheus metrics consume `WriterHealth`).

2. **ClickHouse retry in `run_inserter_worker`** — Wrap the `commit()` error path with a retry loop. On exhaustion, call the dead-letter writer. Increment `WriterHealth` counters. Test: mock the inserter (trait extraction or test-only callback) to simulate failures, verify retry count and dead-letter file creation.

3. **Merkle local persistence module (new)** — `fn persist_anchor(data_dir, anchor) -> Result<()>` writes JSON. `fn load_pending_anchors(data_dir) -> Vec<(path, anchor)>` scans directory. `fn remove_anchor(path) -> Result<()>` deletes after S3 success. Test: write, list, remove, corrupt-file handling.

4. **Wire local persistence into `do_rotate`** — Persist before reset, retry S3, delete on success. Test: integration test with S3 disabled (dev mode) verifies file creation.

5. **Startup recovery in `main.rs`** — Scan pending anchors, attempt S3 upload for each, delete on success. Test: create pending anchor files, run recovery, verify they're processed.

6. **Configurable retention + batch settings + dedup** — Three small independent changes. Test: config env var parsing, DDL interpolation, dedup rejection.

7. **`MerkleAnchor.chain_hashes`** — Extend struct, populate in `finalize()`. Test: verify `chain_hashes` matches input leaves.

### Verification Approach

- `cargo test -p evidence-collector` — all new unit tests pass
- `cargo test -p evidence-collector --test integration_test` — existing 7 tests still pass
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- Manual verification: create a temp dir, write dead-letter files, read them back; create pending anchor files, simulate recovery

## Constraints

- **No external services in tests** — ClickHouse and S3 are not available in CI. All retry/dead-letter/persistence tests must use filesystem or mock patterns. The existing test suite follows this pattern.
- **`clickhouse` crate `Inserter` is not trait-based** — The `Inserter<T>` struct from `clickhouse 0.14` has concrete methods (`write`, `commit`, `end`), not a trait. Retry logic must wrap the concrete struct calls, not inject a mock inserter. Test the retry logic by extracting a testable function that takes a closure/callback.
- **`EvidenceRow` JSON roundtrip is already proven** — The existing `evidence_row_serialization_roundtrip` test guarantees dead-letter files can be replayed. No new serialization format needed.
- **`data_dir` must be configurable** — Default `/data/evidence-collector` for Docker, overridable via `COLLECTOR_DATA_DIR`. Dead-letter and merkle-anchor directories are subdirectories.
- **S06 depends on `MerkleAnchor.chain_hashes`** — This field must be present and populated before S06 can implement `proof_for_bundle()`. Include it in S01 even though S01 doesn't use it for proofs.
- **Bounded dedup set** — In-memory `HashSet<String>` for bundle IDs must be bounded to prevent OOM. Use an LRU or fixed-capacity approach with eviction. A 100K-entry cap is reasonable for hourly windows.

## Common Pitfalls

- **Retry inside the inserter worker must not block the channel** — The `mpsc::Receiver` loop processes one command at a time. If retry sleeps for seconds, it blocks all other writes. Solution: use `tokio::time::sleep` (async) for backoff delays — the worker is already `async`.
- **Dead-letter directory must exist before first write** — Create `{data_dir}/dead-letter/` at startup (in `ClickHouseWriter::new` or `main.rs`), not lazily on first failure. A failure-time `create_dir_all` that itself fails would lose the row.
- **`finalize()` cloning `leaf_hashes` into `chain_hashes`** — `leaf_hashes` is cleared by `reset()` which is called immediately after `finalize()` in `do_rotate`. The clone must happen inside `finalize()` before returning, not after.
- **Corrupted anchor files on startup** — `load_pending_anchors` must handle: truncated JSON, wrong schema, zero-length files, non-JSON files in the directory. Log and skip, don't panic.
- **TTL interpolation SQL injection** — `retention_days` is a `u32`, so format-string interpolation is safe (no user-controlled strings). But the test should verify the DDL contains the expected interval.

## Open Risks

- **Dead-letter replay mechanism** — S01 creates dead-letter files but does not implement a replay tool. Replay is implicitly deferred. The file format (JSON `EvidenceRow`) is stable thanks to the existing roundtrip test, but replay tooling should be tracked.
- **Inserter `commit()` vs `write()` error semantics** — The `clickhouse` 0.14 crate's `Inserter::commit()` flushes pending rows to ClickHouse. If `commit()` fails, it's unclear whether the rows are lost from the inserter's internal buffer or retained for the next `commit()`. The retry logic must assume rows are lost on `commit()` failure and re-enqueue them or dead-letter them. This needs verification against the crate's source.
