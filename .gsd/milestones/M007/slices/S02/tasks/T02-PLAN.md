---
estimated_steps: 5
estimated_files: 5
---

# T02: Add evidence signing and chain test coverage

**Slice:** S02 — Layer 3 Queue + Evidence Signing Tests
**Milestone:** M007

## Description

Cover the four untested code paths in evidence-collector: `LocalSigningProvider::from_file()` (file-based key loading with raw/PEM/error variants), KMS signing (trait-level mock for error modes), `RotatingSigningProvider::reload_from_file()` (hot-reload from disk), and `sign_bundle()` error propagation. This is the highest-value work in the slice — these paths handle production key material and have zero test coverage today.

## Steps

1. Add `tempfile = "3"` under `[dev-dependencies]` in `crates/evidence-collector/Cargo.toml`.
2. In `local.rs` test module: add `from_file_raw_32_byte_key` (write 32 random bytes to tempfile, load, sign+verify), `from_file_pem_encoded_key` (write PEM-wrapped base64 key to tempfile, load, sign+verify), `from_file_invalid_format_returns_error` (write 16 bytes — wrong length), `from_file_missing_file_returns_error` (nonexistent path). Add `is_dev_key_false_for_file_loaded` and `is_dev_key_true_for_generated` assertions. Add `key_id_is_deterministic` (same key bytes → same key_id).
3. In `kms.rs`: add `#[cfg(test)] mod tests` with a `MockKmsSigningProvider` struct that implements `SigningProvider` and can be configured with an optional `SigningError`. Tests: `mock_kms_sign_success`, `mock_kms_throttle_error` (returns `KmsError`), `mock_kms_is_not_dev_key`. This validates KMS-shaped error propagation through the `SigningProvider` trait boundary without requiring real AWS SDK mocking.
4. In `rotation.rs` tests: add `reload_from_file_swaps_key` (write raw key to tempfile, call `reload_from_file`, verify new key_id and sign+verify), `reload_from_file_nonexistent_preserves_active` (reload from bad path → error, verify original key still active and signs correctly).
5. In `chain/signer.rs` tests: add `sign_bundle_propagates_provider_error` (mock returns `Err(KmsError(...))`, assert `sign_bundle` returns `Err`), `sign_bundle_reports_non_dev_key` (mock with `dev: false`, assert `signed.dev_signed == false`).

## Must-Haves

- [ ] `tempfile` added as dev-dependency to evidence-collector
- [ ] `from_file()` tested: raw 32-byte, PEM, invalid format error, missing file error
- [ ] `is_dev_key()` asserted for both file-loaded (false) and generated (true) providers
- [ ] KMS mock tests cover: success path, error propagation (KmsError), `is_dev_key` returns false
- [ ] `reload_from_file()` tested: successful swap and failed reload preserves active
- [ ] `sign_bundle()` error propagation and `dev_signed=false` tested
- [ ] All existing evidence-collector tests still pass

## Verification

- `cargo test -p evidence-collector -- signing chain --nocapture` — all tests pass
- `cargo clippy -p evidence-collector -- -D warnings` — no warnings
- `cargo fmt --all -- --check` — formatted

## Inputs

- `crates/evidence-collector/src/signing/mod.rs` — `SigningProvider` trait definition and `SigningError` enum
- `crates/evidence-collector/src/chain/signer.rs` — existing `MockSigningProvider` pattern in tests
- S02-RESEARCH.md — `from_file()` expects 32-byte raw or ≥64-byte keys; PEM decoded first; `rand_core 0.6` constraint (D024)

## Observability Impact

- Runtime signals changed: none (test-only additions, no runtime code modified)
- Inspection surfaces: `cargo test -p evidence-collector -- signing chain --nocapture` shows per-test pass/fail with assertion messages; test names directly identify which signing code path is covered
- Failure state visibility: test failures report the specific signing provider path that broke (e.g., `from_file_raw_32_byte_key`, `mock_kms_throttle_error`)

## Expected Output

- `crates/evidence-collector/Cargo.toml` — `tempfile` in dev-dependencies
- `crates/evidence-collector/src/signing/local.rs` — 7 new test functions
- `crates/evidence-collector/src/signing/kms.rs` — new test module with `MockKmsSigningProvider` + 3 tests
- `crates/evidence-collector/src/signing/rotation.rs` — 2 new test functions
- `crates/evidence-collector/src/chain/signer.rs` — 2 new test functions
