# S02: Layer 3 Queue + Evidence Signing Tests — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This is a test-only slice — all deliverables are Rust unit tests that can be verified by running `cargo test` and inspecting output. No runtime services, UI, or infrastructure changes.

## Preconditions

- Rust toolchain installed (`cargo`, `rustc`)
- Repository checked out with all S02 changes applied
- No running services required

## Smoke Test

Run `cargo test -p kernel -- queue store --nocapture && cargo test -p evidence-collector -- signing chain --nocapture` — all tests should pass with zero failures.

## Test Cases

### 1. Store cleanup_old deletes reviewed and expired items

1. Run `cargo test -p kernel -- test_cleanup_old_deletes_reviewed_and_expired --nocapture`
2. **Expected:** Test passes. Output shows old reviewed and expired items deleted, pending item preserved, deletion count = 2.

### 2. Store cleanup_old preserves recent reviewed items

1. Run `cargo test -p kernel -- test_cleanup_old_preserves_recent_reviewed --nocapture`
2. **Expected:** Test passes. A recently-reviewed item with a creation date within the retention window is not deleted. Deletion count = 0.

### 3. Store get_pending returns oldest first

1. Run `cargo test -p kernel -- test_get_pending_returns_oldest_first --nocapture`
2. **Expected:** Test passes. Three items inserted in non-chronological order are returned by `get_pending()` sorted ascending by `created_at`.

### 4. LocalSigningProvider from_file with raw 32-byte key

1. Run `cargo test -p evidence-collector -- from_file_raw_32_byte_key --nocapture`
2. **Expected:** Test passes. A raw 32-byte key written to a tempfile is loaded via `from_file()`, signs a message, and the signature verifies correctly. `is_dev_key()` returns `false`.

### 5. LocalSigningProvider from_file with PEM-encoded key

1. Run `cargo test -p evidence-collector -- from_file_pem_encoded_key --nocapture`
2. **Expected:** Test passes. A PEM-encoded Ed25519 key is loaded via `from_file()`, signs and verifies correctly.

### 6. LocalSigningProvider from_file error paths

1. Run `cargo test -p evidence-collector -- from_file_invalid_format_returns_error --nocapture`
2. Run `cargo test -p evidence-collector -- from_file_missing_file_returns_error --nocapture`
3. **Expected:** Both tests pass. Invalid format (16-byte file) returns an error. Missing file path returns an error. No panics.

### 7. is_dev_key flag semantics

1. Run `cargo test -p evidence-collector -- is_dev_key --nocapture`
2. **Expected:** Two tests pass. `is_dev_key()` returns `false` for file-loaded providers and `true` for auto-generated providers.

### 8. Key ID determinism

1. Run `cargo test -p evidence-collector -- key_id_is_deterministic --nocapture`
2. **Expected:** Test passes. Same key bytes loaded twice via `from_file()` produce the same `key_id`.

### 9. KMS mock signing provider

1. Run `cargo test -p evidence-collector -- mock_kms --nocapture`
2. **Expected:** Three tests pass. `mock_kms_sign_success` produces a deterministic fake signature. `mock_kms_throttle_error` returns a `KmsError` with "ThrottlingException". `mock_kms_is_not_dev_key` confirms `is_dev_key()` is `false`.

### 10. Rotation reload_from_file key swap

1. Run `cargo test -p evidence-collector -- reload_from_file_swaps_key --nocapture`
2. **Expected:** Test passes. After `reload_from_file()` with a new key, `key_id` changes and the new key signs correctly.

### 11. Rotation reload_from_file error preservation

1. Run `cargo test -p evidence-collector -- reload_from_file_nonexistent_preserves_active --nocapture`
2. **Expected:** Test passes. Attempting to reload from a nonexistent file returns an error, but the original key remains active and can still sign.

### 12. sign_bundle error propagation

1. Run `cargo test -p evidence-collector -- sign_bundle_propagates_provider_error --nocapture`
2. **Expected:** Test passes. When the signing provider returns an error, `sign_bundle()` propagates it (does not panic or swallow).

### 13. sign_bundle dev_signed=false path

1. Run `cargo test -p evidence-collector -- sign_bundle_reports_non_dev_key --nocapture`
2. **Expected:** Test passes. When the mock provider has `dev: false`, the signed bundle's `dev_signed` field is `false`.

## Edge Cases

### All existing tests still pass

1. Run `cargo test -p kernel --nocapture` and `cargo test -p evidence-collector --nocapture`
2. **Expected:** All pre-existing tests continue to pass — no regressions from new test code or the `#[derive(Debug)]` addition.

### Code quality gates

1. Run `cargo clippy --workspace --all-targets -- -D warnings`
2. Run `cargo fmt --all -- --check`
3. **Expected:** Zero clippy warnings. Formatting is clean.

## Failure Signals

- Any test failure in `cargo test -p kernel -- queue store` or `cargo test -p evidence-collector -- signing chain`
- Clippy warnings in evidence-collector or kernel crates
- Formatting differences detected by `cargo fmt --all -- --check`
- Missing `tempfile` dev-dependency causing compilation failure in evidence-collector tests

## Requirements Proved By This UAT

- PR-TEST-02 (partially) — Layer 3 queue/store and evidence signing providers have comprehensive test coverage for all previously-untested code paths. Full validation requires S04 coverage threshold enforcement.

## Not Proven By This UAT

- Exact line coverage percentages (≥80% is estimated from code path analysis, not measured by a coverage tool)
- Real AWS KMS integration behavior (tested via trait-boundary mock only)
- CI gate enforcement of coverage thresholds (deferred to S04)

## Notes for Tester

- All tests are deterministic and should not flake.
- Tests use in-memory SQLite (`:memory:`) and `tempfile` — no persistent state or cleanup needed.
- The `--nocapture` flag is recommended for visibility into assertion messages but tests pass without it.
- Run individual tests by name filter if investigating a specific failure (e.g., `cargo test -p evidence-collector -- from_file_raw`).
