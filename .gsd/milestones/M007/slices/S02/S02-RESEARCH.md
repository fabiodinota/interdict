# S02: Layer 3 Queue + Evidence Signing Tests — Research

**Date:** 2026-03-15

## Summary

The S02 scope covers two subsystems: the kernel's Layer 3 human review queue/store and the evidence-collector's signing/chain modules. Contrary to the original assessment's framing of these as "untested," both subsystems already have meaningful test suites. The Layer 3 queue has 8 tests and the store has 8 tests — covering happy paths, fail-mode behavior, capacity limits, timeout expiry, and persistence. On the signing side, `local.rs` has 3 tests, `rotation.rs` has 4, `chain/hasher.rs` has 4, and `chain/signer.rs` has 1. The true gaps are: **KMS signing (0 tests)**, **`from_file()` and `reload_from_file()` file-based key loading (0 tests)**, **`cleanup_old()` store method (0 tests)**, and several edge-case paths across all modules. Total existing tests: 28. An estimated 15–20 targeted additions should push all modules past the 80% coverage threshold.

The KMS mock strategy is the most consequential design decision. The `KmsSigningProvider` wraps `aws_sdk_kms::Client` directly — testing it faithfully requires either adding the `aws-smithy-mocks` crate (the official AWS SDK test utility) or testing purely through the `SigningProvider` trait boundary. The trait-based approach is simpler and already proven by the `MockSigningProvider` in `chain/signer.rs`, but it can't test KMS-specific error modes (throttling, algorithm mismatch) that the slice context explicitly requires. The recommendation is a hybrid: use trait-level mocks for `sign_bundle()` error propagation tests, and add a focused `MockKmsSigningProvider` struct within `kms.rs` that simulates KMS-specific failure modes without requiring real AWS SDK mocking.

## Recommendation

### Approach: Targeted gap-filling with trait-based KMS mock

1. **Store `cleanup_old()`** — Add 2–3 tests: cleanup deletes old reviewed/expired items, preserves pending items, returns correct count.
2. **KMS signing** — Create a `MockKmsSigningProvider` that implements `SigningProvider` and can be configured to return `SigningError::KmsError` for throttling/timeout/algorithm error scenarios. Also add a unit test for the `KmsSigningProvider` struct itself that verifies the `SigningAlgorithmSpec::from("ED25519_SHA_512")` constant is correct and that `is_dev_key()` returns `false`. Do NOT mock the full AWS SDK client (too much ceremony for the value).
3. **Local signing `from_file()`** — Use `tempfile` crate (already a dev-dependency of `kernel`) to test: raw 32-byte key file, PEM-encoded key file, invalid key format error, missing file error. Also assert `is_dev_key()` returns `false` for file-loaded keys and `true` for generated keys.
4. **Rotation `reload_from_file()`** — Use `tempfile` to write a key, reload, verify new key signs correctly and old key ID is replaced. Test error path: reload from nonexistent file returns error without changing active provider.
5. **Chain signer** — Add error propagation test (provider returns `SigningError` → `sign_bundle` returns `Err`), and `dev_signed=false` path.
6. **Queue/Store edge cases** — Add: concurrent `submit_verdict` race (two reviewers for same request), `get_pending_items` returns items in creation order, channel-dropped scenario in queue.

### Why this approach

- The existing test suites are solid — no need for rewrites or restructuring.
- Trait-based KMS mocking avoids adding `aws-smithy-mocks` as a dependency (which is still in early versions and would pull in additional Smithy crates).
- File-based key loading tests are the highest-value addition per line of test code — they cover the production key path that `generate()` tests don't.
- The `cleanup_old()` gap is easy to fill and covers the only completely untested public method in the store.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Mock signing provider | `MockSigningProvider` in `chain/signer.rs` tests | Already implements `SigningProvider` trait with configurable behavior |
| In-memory SQLite for store tests | `ReviewQueueStore::new(":memory:")` | Used by all existing store tests — no temp files needed |
| Test helper for queue construction | `make_queue()` in `queue.rs` tests | Creates queue with configurable timeout and capacity |
| Test helper for queue items | `make_test_item()` / `make_expired_item()` in `store.rs` tests | Pre-built `QueueItem` structs with sensible defaults |
| Test `VerdictTrace` construction | `make_test_trace()` in `queue.rs` tests | Minimal valid trace for queue escalation tests |
| Temp file creation for key tests | `tempfile` crate (in kernel dev-deps, needs adding to evidence-collector) | Automatic cleanup, cross-platform, already in workspace |
| Ed25519 key generation for tests | `LocalSigningProvider::generate()` | Generates random dev key, no file I/O needed |

## Existing Code and Patterns

- `crates/kernel/src/policy/layer3/queue.rs` (504 lines, 8 tests) — Review queue with semaphore-bounded connection hold, oneshot channels for verdict delivery, SQLite persistence. Well-tested core paths. **Gap:** `get_pending_count()` not directly tested (only checked as side-effect in capacity test), `get_pending_items()` delegation only tested implicitly via store tests.
- `crates/kernel/src/policy/layer3/store.rs` (497 lines, 8 tests) — SQLite persistence with WAL mode, parameterized queries. CRUD + expiry covered. **Gap:** `cleanup_old()` method has zero tests. Ordering guarantee ("oldest first") is assumed but not explicitly asserted.
- `crates/evidence-collector/src/signing/local.rs` (147 lines, 3 tests) — Ed25519 key gen, sign, verify. **Gap:** `from_file()` (raw bytes, PEM, error paths) completely untested. `is_dev_key()` flag not asserted. `key_id` determinism not tested.
- `crates/evidence-collector/src/signing/kms.rs` (66 lines, 0 tests) — AWS KMS signing via `aws_sdk_kms::Client`. **Gap:** Entirely untested. `new()` calls real AWS. `sign()` calls real AWS. `is_dev_key()` returns `false`. Uses `SigningAlgorithmSpec::from("ED25519_SHA_512")`.
- `crates/evidence-collector/src/signing/rotation.rs` (220 lines, 4 tests) — ArcSwap-based atomic key rotation. **Gap:** `reload_from_file()` untested (file I/O path). `is_dev_key()` propagation through `BoxedProviderAdapter` not tested. Concurrent signing during rotation not tested.
- `crates/evidence-collector/src/chain/signer.rs` (70 lines, 1 test) — `sign_bundle()` function delegates to `SigningProvider`. **Gap:** Error propagation path untested. `dev_signed=false` path not covered.
- `crates/evidence-collector/src/chain/hasher.rs` (130 lines, 4 tests) — `ChainState` hash chaining and `ChainManager` per-kernel-ID isolation. Thorough coverage of determinism, tampering, independence. **Gap:** Empty content edge case, large sequence number behavior.
- `crates/evidence-collector/src/signing/mod.rs` (26 lines) — Trait definition and error types. No code to test directly.
- `crates/evidence-collector/src/chain/mod.rs` (2 lines) — Module re-exports only.

## Constraints

- **`tempfile` needs to be added as a dev-dependency for `evidence-collector`** — it's already a dev-dep for `kernel` but not for `evidence-collector`. The `from_file()` and `reload_from_file()` tests need it.
- **KMS cannot be tested against real AWS** — all KMS tests must be mock-based. The `KmsSigningProvider::new()` constructor calls `aws_config::load_defaults()` and `kms_client.get_public_key()` — this is not testable without AWS credentials or a full SDK mock. Tests should focus on the `SigningProvider` trait boundary instead.
- **SQLite tests use `:memory:` — no cross-test state leakage** — all existing store tests correctly use in-memory SQLite. New tests should follow the same pattern.
- **`cleanup_old()` uses SQLite `datetime('now')` — time-dependent** — the cleanup method compares against `datetime('now')`, which means test items need dates far in the past to be eligible for cleanup. The existing `make_expired_item()` helper uses `2020-01-01` timestamps, which work for this.
- **Queue tests with timeouts use real time** — existing tests use `Duration::from_millis(100)` for timeouts. This works on fast machines but could theoretically flake on very slow CI. The existing pattern (small timeouts + `tokio::time::sleep` for synchronization) has proven stable across the existing 8 tests.
- **`rand_core 0.6` constraint (D024)** — evidence-collector uses `rand_core 0.6` directly (not `rand 0.9`) due to `ed25519-dalek 2.x` compatibility. Test code generating keys must use `OsRng` from `rand_core 0.6`.
- **No `aws-smithy-mocks` in dependencies** — adding it would be the "right" way to mock KMS but adds transitive deps and is still early-stage. Recommend against for this slice.

## Common Pitfalls

- **`from_file()` expects specific key lengths** — The function accepts 32-byte raw keys and ≥64-byte keys (takes first 32 bytes). PEM files are decoded first. Tests must use correctly-sized payloads or PEM-wrapped payloads to avoid `LocalKeyError`.
- **`cleanup_old()` date arithmetic is SQLite-native** — The SQL uses `datetime('now', '-N days')` which means the "age" is relative to SQLite's clock, not Rust's. Test items must have `created_at` values old enough to be caught by the cleanup window.
- **`BoxedProviderAdapter` wraps `Arc<dyn SigningProvider>` in `Box`** — When testing `RotatingSigningProvider`, the `current()` method returns `Arc<Box<dyn SigningProvider>>`, not `Arc<dyn SigningProvider>`. Callers must double-deref or use trait methods directly on the returned value.
- **Queue `submit_verdict` updates store before delivering to channel** — If the store update succeeds but the channel send fails (receiver dropped), the store will show "reviewed" but the connection got the fail-mode default. This race is by design but worth a test to document.
- **`ChainManager::link()` takes `&mut self`** — Concurrent chain submissions require external synchronization (e.g., `Arc<Mutex<ChainManager>>` as used in the gRPC service). Unit tests don't need concurrency testing since the API is inherently sequential.

## Open Risks

- **Coverage measurement accuracy** — Without `cargo-llvm-cov` in CI (comes in S04), the ≥80% coverage target is estimated from branch analysis. The 28 existing + ~15-20 new tests should exceed 80% based on production line counts (queue: 504 lines, store: 497 lines, local: 147, kms: 66, rotation: 220, chain/signer: 70, chain/hasher: 130 = ~1634 total production lines), but exact percentages require instrumented measurement.
- **KMS mock fidelity** — Trait-level mocking doesn't exercise the actual AWS SDK call path in `KmsSigningProvider::sign()`. A real KMS integration test would require either a localstack instance or AWS credentials. This is acceptable for unit test coverage but leaves a small integration gap that could be closed with a manual test or E2E in S04.
- **`reload_from_file()` on Windows** — File path handling and PEM line endings may behave differently on Windows vs Linux. The `from_file()` implementation uses `std::fs::read` (binary) and splits PEM on lines, which should handle both `\n` and `\r\n`. Worth verifying in the test.
- **`from_file()` with 64-byte keys** — The code takes `decoded[..32]` from keys ≥64 bytes, assuming the first 32 bytes are the secret key. This matches the standard Ed25519 expanded key format but is undocumented. A test should verify this path works correctly with a known 64-byte key.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust | rust-skills | installed (project skill) |
| AWS SDK mocking | — | none found (trait-based approach recommended) |
| SQLite testing | — | none found (`:memory:` pattern is standard) |
| Ed25519 / cryptographic testing | — | none found (ed25519-dalek has good test examples in its docs) |

## Sources

- `crates/kernel/src/policy/layer3/queue.rs` inline review — 504 lines, 8 tests, all core paths covered
- `crates/kernel/src/policy/layer3/store.rs` inline review — 497 lines, 8 tests, `cleanup_old()` gap identified
- `crates/evidence-collector/src/signing/local.rs` inline review — 147 lines, 3 tests, `from_file()` gap identified
- `crates/evidence-collector/src/signing/kms.rs` inline review — 66 lines, 0 tests, entirely untested
- `crates/evidence-collector/src/signing/rotation.rs` inline review — 220 lines, 4 tests, `reload_from_file()` gap
- `crates/evidence-collector/src/chain/signer.rs` inline review — 70 lines, 1 test, error path gap
- `crates/evidence-collector/src/chain/hasher.rs` inline review — 130 lines, 4 tests, thorough coverage
- `crates/evidence-collector/Cargo.toml` — dependencies and dev-dependencies review
- D024 in DECISIONS.md — `rand_core 0.6` constraint for ed25519-dalek compatibility
- S01-RESEARCH.md — established patterns for file-based testing with `tempfile` crate
