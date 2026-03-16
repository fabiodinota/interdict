# S01: Evidence Pipeline Resilience — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All resilience behaviors (retry, dead-letter, persistence, recovery, dedup) are exercised by 79 unit tests + 7 integration tests using filesystem and mock patterns. No ClickHouse or S3 runtime is required — the test patterns prove the logic through closure callbacks, temp directories, and serialization roundtrips.

## Preconditions

- Rust toolchain installed (rustup with stable)
- Working directory is the repo root (or worktree)
- No ClickHouse or S3 instance needed — all tests are self-contained

## Smoke Test

Run `cargo test -p evidence-collector` — all 86 tests (79 unit + 7 integration) must pass with 0 failures.

## Test Cases

### 1. ClickHouse retry exhaustion produces dead-letter files

1. Run `cargo test -p evidence-collector retry_exhaustion_creates_dead_letter`
2. Test creates a callback that always fails, simulating permanent ClickHouse unavailability
3. Verify the test asserts 6 total call attempts (1 initial + 5 retries)
4. Verify the test asserts 5 retries were counted
5. **Expected:** 2 dead-letter JSON files created in the temp directory, each deserializable back to a valid `EvidenceRow` with matching fields

### 2. ClickHouse retry succeeds after transient failures

1. Run `cargo test -p evidence-collector retry_succeeds_after_failures`
2. Test creates a callback that fails twice, then succeeds on the third call
3. **Expected:** 3 total calls, 2 retries counted, no dead-letter files created

### 3. WriterHealth counters track pipeline state

1. Run `cargo test -p evidence-collector writer_health_counter_increments`
2. Test creates a `WriterHealth` instance, calls each `increment_*()` method
3. **Expected:** `rows_written`, `rows_retried`, `rows_dead_lettered` each read back as 1 after one increment

### 4. Dead-letter file roundtrip preserves all EvidenceRow fields

1. Run `cargo test -p evidence-collector dead_letter_roundtrip`
2. Test creates an `EvidenceRow` with all fields populated, writes to dead-letter, reads back
3. **Expected:** All fields (bundle_id, kernel_id, vendor, model, policy_action, timestamp, chain_hash, previous_chain_hash, signature, public_key, etc.) match exactly after deserialization

### 5. Merkle anchor persist/load/remove roundtrip

1. Run `cargo test -p evidence-collector persist_and_load_roundtrip`
2. Test persists a `MerkleAnchor` with root hash, hour, bundle_count, and chain_hashes to a temp directory
3. Test loads pending anchors from the same directory
4. **Expected:** Loaded anchor has identical root, hour, bundle_count, and chain_hashes. Remove deletes the file, subsequent load returns empty.

### 6. Corrupt anchor files are skipped without panic

1. Run `cargo test -p evidence-collector corrupt_file_skipped`
2. Test writes invalid JSON (`{invalid`) to a `.json` file in the anchors directory
3. Run `cargo test -p evidence-collector empty_file_skipped`
4. Test writes a zero-length `.json` file
5. Run `cargo test -p evidence-collector non_json_file_skipped`
6. Test writes a `.txt` file (non-JSON extension)
7. **Expected:** All three cases: `load_pending_anchors` returns empty vec, no panic, corrupt files logged and skipped

### 7. chain_hashes populated from leaf hashes in finalize()

1. Run `cargo test -p evidence-collector finalize_populates_chain_hashes`
2. Test adds 3 leaves to a MerkleBuilder, calls finalize()
3. **Expected:** `anchor.chain_hashes` has exactly 3 entries matching the input leaf hashes in order

### 8. Configurable retention TTL in DDL

1. Run `cargo test -p evidence-collector schema_ddl_retention_days_configurable`
2. Test calls `table_ddl(30)` and checks the output string
3. **Expected:** DDL contains `INTERVAL 30 DAY DELETE` (not the old hardcoded `7 YEAR`)

### 9. Bundle-ID deduplication rejects duplicates

1. Run `cargo test -p evidence-collector dedup_rejects_duplicate`
2. Test calls `track("bundle-1")` twice on a `DeduplicationTracker`
3. **Expected:** First call returns `true` (accepted), second returns `false` (rejected)

### 10. Deduplication evicts oldest at capacity

1. Run `cargo test -p evidence-collector dedup_evicts_at_capacity`
2. Test fills tracker to capacity, then inserts one more entry
3. **Expected:** Oldest entry is evicted (re-tracking it returns `true`), newest entries still tracked (return `false`)

### 11. Config env var parsing

1. Run `cargo test -p evidence-collector config_data_dir_from_env`
2. Run `cargo test -p evidence-collector config_batch_settings_from_env`
3. **Expected:** `COLLECTOR_DATA_DIR` parses to custom path. `COLLECTOR_CH_MAX_ROWS`, `COLLECTOR_CH_PERIOD_MS`, `COLLECTOR_CH_MAX_BYTES` parse to configured values with correct defaults (1000, 1000, 52428800).

### 12. Integration tests unchanged

1. Run `cargo test -p evidence-collector --test integration_test`
2. **Expected:** All 7 integration tests pass — evidence schema, serialization, Merkle tree, multi-kernel chains, evidence buffer, signing provider, chain integrity roundtrip

## Edge Cases

### Retry with first-attempt success

1. Run `cargo test -p evidence-collector retry_succeeds_on_first_attempt`
2. **Expected:** 1 total call, 0 retries, no dead-letter files, no backoff delay

### Dead-letter file naming includes bundle_id

1. Run `cargo test -p evidence-collector dead_letter_creates_file_with_bundle_id`
2. **Expected:** Created filename contains the bundle_id string for traceability

### MerkleAnchor serde roundtrip with hex encoding

1. Run `cargo test -p evidence-collector merkle_anchor_serde_roundtrip`
2. **Expected:** Serialize → deserialize preserves root hash, hour, bundle_count, and chain_hashes through JSON hex encoding

### Dedup accepts unique bundle_ids

1. Run `cargo test -p evidence-collector dedup_accepts_unique`
2. **Expected:** Two different bundle_ids both return `true` from `track()`

## Failure Signals

- Any test failure in `cargo test -p evidence-collector` — regression in pipeline resilience logic
- `cargo clippy --workspace --all-targets -- -D warnings` producing warnings — code quality regression
- Dead-letter files accumulating in `{data_dir}/dead-letter/` at runtime — ClickHouse is persistently failing
- Merkle anchor files accumulating in `{data_dir}/merkle-anchors/` at runtime — S3 is unreachable
- `WriterHealth.rows_dead_lettered > 0` — evidence data loss risk, investigate ClickHouse health

## Requirements Proved By This UAT

- FH-INTEGRITY-01 — All 5 sub-findings (H-01 retry/dead-letter, H-02 anchor persistence/recovery, M-02 retention TTL, M-03 batch settings, L-04 dedup) proved by tests. Requirement advanced but not yet validated — depends on S06 for Prometheus metrics exposure.

## Not Proven By This UAT

- Prometheus metrics exposure of WriterHealth counters (S06 scope)
- Merkle proof generation using chain_hashes (S06 scope)
- Runtime behavior under real ClickHouse/S3 failure — tests use mocks/filesystem. Cross-service integration tests in S06 will provide runtime proof.
- Dead-letter file replay — no automated replay mechanism exists; files are for manual inspection

## Notes for Tester

- All tests are self-contained — no external services needed. `cargo test -p evidence-collector` runs everything.
- The retry tests use `tokio::time::sleep` with real delays (200ms-5s backoff), so the exhaustion test takes ~6 seconds. This is intentional — it proves real async backoff timing.
- Dead-letter and anchor persistence tests use `tempdir` — no cleanup needed.
- The `#[cfg(test)]` `retry_with_backoff` function tests the retry algorithm independently from the ClickHouse inserter. The production `commit_with_retry` uses the same constants and logic but operates on the real inserter.
