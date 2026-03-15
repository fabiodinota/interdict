---
id: S02
parent: M007
milestone: M007
provides:
  - cleanup_old() test coverage for ReviewQueueStore (deletion/preservation semantics)
  - get_pending() ordering assertion (oldest-first)
  - from_file() test coverage for LocalSigningProvider (raw, PEM, error paths)
  - is_dev_key() assertions for file-loaded vs generated providers
  - KMS trait-boundary mock tests (success, throttle error, is_dev_key)
  - reload_from_file() rotation tests (key swap + failed-reload preservation)
  - sign_bundle() error propagation and dev_signed=false coverage
requires:
  - slice: none
    provides: none
affects:
  - S04
key_files:
  - crates/kernel/src/policy/layer3/store.rs
  - crates/evidence-collector/Cargo.toml
  - crates/evidence-collector/src/signing/local.rs
  - crates/evidence-collector/src/signing/kms.rs
  - crates/evidence-collector/src/signing/rotation.rs
  - crates/evidence-collector/src/chain/signer.rs
key_decisions:
  - Added Debug derive to LocalSigningProvider to enable unwrap_err() in tests (additive, no runtime change)
patterns_established:
  - make_item_at() helper for timestamp-specific test items in store.rs
  - sign_and_verify() helper for concise sign+verify assertions in local.rs tests
  - MockKmsSigningProvider with configurable SigningError for trait-boundary KMS testing
  - FailingMockProvider pattern in chain/signer.rs for error propagation tests
  - tempfile-based key file testing pattern for from_file() and reload_from_file()
observability_surfaces:
  - none
drill_down_paths:
  - .gsd/milestones/M007/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S02/tasks/T02-SUMMARY.md
duration: 35m
verification_result: passed
completed_at: 2026-03-15
---

# S02: Layer 3 Queue + Evidence Signing Tests

**Added 17 new tests covering store cleanup_old() semantics, get_pending() ordering, from_file() key loading, KMS mock signing, key rotation reload, and sign_bundle error propagation — closing all untested code paths in queue/store and evidence signing.**

## What Happened

T01 added 3 store tests and a `make_item_at()` helper to `store.rs`. The tests cover `cleanup_old()` deletion of old reviewed/expired items while preserving pending items, `cleanup_old()` correctly preserving recent reviewed items, and `get_pending()` returning items in oldest-first creation order. The existing 8 store tests and all queue tests continue to pass (22 total in the kernel queue/store filter).

T02 added 14 tests across 4 evidence-collector source files and added `tempfile` as a dev-dependency. In `local.rs`: 7 tests cover `from_file()` with raw 32-byte keys, PEM-encoded keys, invalid format errors, missing file errors, `is_dev_key()` flag semantics for file-loaded vs generated providers, and `key_id` determinism. In `kms.rs`: a `MockKmsSigningProvider` struct implementing `SigningProvider` with configurable error injection supports 3 tests covering successful signing, throttling error propagation, and `is_dev_key()`. In `rotation.rs`: 2 tests cover `reload_from_file()` key swapping (verifying key_id changes and new key signs correctly) and failed-reload preservation (bad path returns error without changing active provider). In `chain/signer.rs`: a `FailingMockProvider` enables 2 tests covering `sign_bundle()` error propagation and `dev_signed=false` path.

## Verification

- `cargo test -p kernel -- queue store --nocapture` — 22/22 pass (8 existing + 3 new store + queue tests)
- `cargo test -p evidence-collector -- signing chain --nocapture` — 31 pass (28 unit + 3 integration, 14 new)
- `cargo clippy --workspace --all-targets -- -D warnings` — zero warnings
- `cargo fmt --all -- --check` — formatted

## Requirements Advanced

- PR-TEST-02 — Layer 3 queue/store and evidence signing providers now have comprehensive test coverage closing all identified untested code paths.

## Requirements Validated

- none (PR-TEST-02 requires S04 coverage thresholds to be fully validated)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- KMS tests use a trait-boundary mock, not a real AWS SDK mock — real AWS KMS throttling, algorithm negotiation, and network behavior are not tested. This is by design (no AWS credentials needed for CI), but operator-level integration testing against real KMS would add confidence.
- Coverage percentages are estimated at ≥80% based on code path analysis; exact line coverage measurement deferred to S04 when CI coverage gates are enforced.

## Follow-ups

- S04 will enforce coverage thresholds as hard CI gates and can build on the MockKmsSigningProvider and FailingMockProvider patterns for negative/adversarial testing.

## Files Created/Modified

- `crates/kernel/src/policy/layer3/store.rs` — added 3 test functions and `make_item_at()` helper
- `crates/evidence-collector/Cargo.toml` — added `tempfile = "3"` dev-dependency
- `crates/evidence-collector/src/signing/local.rs` — added `#[derive(Debug)]`, `sign_and_verify()` helper, 7 new test functions
- `crates/evidence-collector/src/signing/kms.rs` — added `#[cfg(test)] mod tests` with `MockKmsSigningProvider` + 3 tests
- `crates/evidence-collector/src/signing/rotation.rs` — added 2 new test functions for `reload_from_file()`
- `crates/evidence-collector/src/chain/signer.rs` — added `FailingMockProvider` + 2 new test functions

## Forward Intelligence

### What the next slice should know
- The `MockKmsSigningProvider` in `kms.rs` and `FailingMockProvider` in `chain/signer.rs` are reusable patterns for any test that needs a configurable signing provider. S04 negative testing should build on these rather than creating new mocks.
- The `sign_and_verify()` helper in `local.rs` tests is a good template for concise roundtrip assertions.
- `tempfile` is now available as a dev-dependency in evidence-collector — no need to add it again.

### What's fragile
- `make_item_at()` helper uses hardcoded `created_at` strings — if the `make_test_item()` signature changes, both helpers need updating.
- KMS mock returns a fixed 64-byte fake signature — if signature format validation is added downstream, this mock will need updating.

### Authoritative diagnostics
- `cargo test -p kernel -- store --nocapture` — shows all store test results with assertion detail
- `cargo test -p evidence-collector -- signing chain --nocapture` — shows all signing/chain test results with assertion detail

### What assumptions changed
- No assumptions changed — the code paths matched what was expected from research.
