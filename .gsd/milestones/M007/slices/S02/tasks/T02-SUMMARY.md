---
id: T02
parent: S02
milestone: M007
provides:
  - from_file() test coverage for LocalSigningProvider (raw, PEM, error paths)
  - is_dev_key() assertions for file-loaded vs generated providers
  - KMS trait-boundary mock tests (success, throttle error, is_dev_key)
  - reload_from_file() rotation tests (swap + failed-reload preservation)
  - sign_bundle() error propagation and dev_signed=false coverage
key_files:
  - crates/evidence-collector/Cargo.toml
  - crates/evidence-collector/src/signing/local.rs
  - crates/evidence-collector/src/signing/kms.rs
  - crates/evidence-collector/src/signing/rotation.rs
  - crates/evidence-collector/src/chain/signer.rs
key_decisions:
  - Added Debug derive to LocalSigningProvider to enable unwrap_err() in tests
patterns_established:
  - sign_and_verify() helper for concise sign+verify assertions in local.rs tests
  - MockKmsSigningProvider with configurable SigningError for trait-boundary KMS testing
  - FailingMockProvider pattern in chain/signer.rs for error propagation tests
  - tempfile-based key file testing pattern for from_file() and reload_from_file()
observability_surfaces:
  - none
duration: 20m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Add evidence signing and chain test coverage

**Added 14 new tests covering from_file(), KMS mock, key rotation reload, and sign_bundle error propagation across 4 files.**

## What Happened

Covered the four untested code paths in evidence-collector:

1. **local.rs** (7 new tests): `from_file_raw_32_byte_key` and `from_file_pem_encoded_key` write keys to tempfiles, load via `from_file()`, and verify sign+verify roundtrip. `from_file_invalid_format_returns_error` (16-byte file rejected) and `from_file_missing_file_returns_error` (nonexistent path). `is_dev_key_false_for_file_loaded` and `is_dev_key_true_for_generated` assert the dev-key flag. `key_id_is_deterministic` confirms same key bytes → same key_id across two separate loads. Also added `sign_and_verify()` helper and `#[derive(Debug)]` on `LocalSigningProvider`.

2. **kms.rs** (3 new tests): Added `MockKmsSigningProvider` struct implementing `SigningProvider` with configurable error injection. Tests: `mock_kms_sign_success` (deterministic fake signature), `mock_kms_throttle_error` (KmsError propagation with ThrottlingException), `mock_kms_is_not_dev_key`.

3. **rotation.rs** (2 new tests): `reload_from_file_swaps_key` writes raw key to tempfile, calls `reload_from_file()`, verifies key_id changes and new key signs correctly. `reload_from_file_nonexistent_preserves_active` attempts reload from bad path, asserts error returned and original key remains active with valid signing.

4. **chain/signer.rs** (2 new tests): `sign_bundle_propagates_provider_error` uses `FailingMockProvider` that returns `KmsError`, asserts `sign_bundle()` propagates it. `sign_bundle_reports_non_dev_key` uses mock with `dev: false`, asserts `signed.dev_signed == false`.

Also added `tempfile = "3"` as dev-dependency and the Observability Impact section to T02-PLAN.md (pre-flight fix).

## Verification

- `cargo test -p evidence-collector -- signing chain --nocapture` — 28 unit + 3 integration tests pass (14 new)
- `cargo test -p kernel -- queue store --nocapture` — 22 tests pass
- `cargo clippy -p evidence-collector -- -D warnings` — zero warnings
- `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- `cargo fmt --all -- --check` — formatted

Slice-level verification (all checks pass — this is the final task of the slice):
- ✅ `cargo test -p kernel -- queue store --nocapture` — 22 pass
- ✅ `cargo test -p evidence-collector -- signing chain --nocapture` — 31 pass (28 unit + 3 integration)
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- ✅ `cargo fmt --all -- --check` — formatted

## Diagnostics

- `cargo test -p evidence-collector -- signing chain --nocapture` shows per-test pass/fail with assertion messages
- Test names directly identify coverage: `from_file_raw_32_byte_key`, `mock_kms_throttle_error`, `reload_from_file_swaps_key`, `sign_bundle_propagates_provider_error`

## Deviations

- Added `#[derive(Debug)]` to `LocalSigningProvider` — required for `unwrap_err()` in error-path tests. This is additive and does not change runtime behavior.

## Known Issues

None.

## Files Created/Modified

- `crates/evidence-collector/Cargo.toml` — added `tempfile = "3"` dev-dependency
- `crates/evidence-collector/src/signing/local.rs` — added `#[derive(Debug)]`, `sign_and_verify()` helper, 7 new test functions
- `crates/evidence-collector/src/signing/kms.rs` — added `#[cfg(test)] mod tests` with `MockKmsSigningProvider` + 3 tests
- `crates/evidence-collector/src/signing/rotation.rs` — added 2 new test functions for `reload_from_file()`
- `crates/evidence-collector/src/chain/signer.rs` — added `FailingMockProvider` + 2 new test functions
- `.gsd/milestones/M007/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
