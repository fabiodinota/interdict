# S02: Layer 3 Queue + Evidence Signing Tests

**Goal:** Layer 3 queue/store modules and all evidence signing providers (local Ed25519, KMS mock, key rotation, chain management) are fully tested with ≥80% estimated line coverage.

**Demo:** `cargo test -p kernel queue store && cargo test -p evidence-collector signing chain` passes with all new tests green.

## Must-Haves

- Store `cleanup_old()` has tests covering: deletes old reviewed/expired items, preserves pending items, returns correct count
- Local signing `from_file()` tested for: raw 32-byte key, PEM-encoded key, invalid format error, missing file error
- `is_dev_key()` returns `false` for file-loaded keys, `true` for generated keys
- KMS signing has trait-level mock tests covering: throttling error, algorithm error, `is_dev_key()` returns `false`
- Rotation `reload_from_file()` tested: successful reload changes active key, failed reload preserves existing key
- Chain signer `sign_bundle()` error propagation tested, `dev_signed=false` path covered
- `tempfile` added as dev-dependency to `evidence-collector`
- All existing tests continue to pass

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cargo test -p kernel -- queue store --nocapture` — all queue/store tests pass including new `cleanup_old` tests
- `cargo test -p evidence-collector -- signing chain --nocapture` — all signing/chain tests pass including new from_file, KMS mock, rotation, and error propagation tests
- `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- `cargo fmt --all -- --check` — formatted

## Observability / Diagnostics

- Runtime signals: none (test-only slice)
- Inspection surfaces: `cargo test` output with `--nocapture` for detailed assertion messages
- Failure visibility: test names clearly identify the gap being covered (e.g., `cleanup_old_deletes_reviewed_items`, `from_file_raw_32_byte_key`)
- Redaction constraints: none (no secrets in test code — generated keys only)

## Integration Closure

- Upstream surfaces consumed: `ReviewQueueStore` API, `SigningProvider` trait, `LocalSigningProvider`, `RotatingSigningProvider`, `sign_bundle()`, `ChainState`/`ChainManager`
- New wiring introduced in this slice: none (test-only additions)
- What remains before the milestone is truly usable end-to-end: S04 expands coverage further and enforces thresholds as CI gates

## Tasks

- [x] **T01: Add store cleanup_old and queue edge-case tests** `est:30m`
  - Why: `cleanup_old()` is the only completely untested public method in the store. Ordering of `get_pending` results is assumed but never asserted.
  - Files: `crates/kernel/src/policy/layer3/store.rs`
  - Do: Add tests using existing `make_test_item()`/`make_expired_item()` helpers and `:memory:` SQLite pattern. Tests: (1) `cleanup_old` deletes old reviewed/expired items, preserves pending, returns count; (2) `cleanup_old` with zero-day threshold; (3) `get_pending` returns items in creation order (oldest first). Use far-past `created_at` dates (from `make_expired_item`) so items are eligible for cleanup. Mark items as "reviewed" or "expired" via `submit_verdict()` or `expire_timed_out()` before calling `cleanup_old()`.
  - Verify: `cargo test -p kernel -- store --nocapture`
  - Done when: All new store tests pass; existing 8 tests still pass

- [x] **T02: Add evidence signing and chain test coverage** `est:1h`
  - Why: `from_file()`, KMS, `reload_from_file()`, and `sign_bundle` error path are the four untested code paths identified in research. This is the highest-risk work in the slice (file I/O, mock design, tempfile dep).
  - Files: `crates/evidence-collector/Cargo.toml`, `crates/evidence-collector/src/signing/local.rs`, `crates/evidence-collector/src/signing/kms.rs`, `crates/evidence-collector/src/signing/rotation.rs`, `crates/evidence-collector/src/chain/signer.rs`
  - Do:
    1. Add `tempfile` as dev-dependency in `evidence-collector/Cargo.toml`
    2. In `local.rs` tests: add tests for `from_file()` with raw 32-byte key, PEM-encoded key, invalid key format, missing file. Assert `is_dev_key()` returns `false` for file-loaded and `true` for generated. Assert `key_id` is deterministic (same key → same ID).
    3. In `kms.rs`: add `#[cfg(test)]` module with `MockKmsSigningProvider` struct implementing `SigningProvider` that can return configurable `SigningError::KmsError`. Test throttling error, missing signature error, and successful sign. Verify `is_dev_key()` returns `false`. (Don't mock real AWS SDK — use trait boundary.)
    4. In `rotation.rs` tests: add `reload_from_file()` test using `tempfile` — write a key, reload, verify new key signs correctly. Add error path test: reload from nonexistent file returns error without changing active provider.
    5. In `chain/signer.rs` tests: add error propagation test (mock provider returns `Err` → `sign_bundle` returns `Err`). Add `dev_signed=false` test using mock with `dev: false`.
  - Verify: `cargo test -p evidence-collector -- signing chain --nocapture`
  - Done when: All new evidence-collector tests pass; existing tests still pass; `cargo clippy` clean

## Files Likely Touched

- `crates/kernel/src/policy/layer3/store.rs`
- `crates/evidence-collector/Cargo.toml`
- `crates/evidence-collector/src/signing/local.rs`
- `crates/evidence-collector/src/signing/kms.rs`
- `crates/evidence-collector/src/signing/rotation.rs`
- `crates/evidence-collector/src/chain/signer.rs`
