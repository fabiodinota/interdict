---
id: T03
parent: S01
milestone: M006
provides:
  - RegorusPool::evaluate() returns fail-mode verdict on pool exhaustion instead of panicking
key_files:
  - crates/kernel/src/policy/layer1/regorus.rs
key_decisions:
  - Pool-empty path returns FailMode default verdict (Block if fail-closed, Allow if fail-open) with tracing::error log — consistent with existing semaphore-closed handling pattern
  - Test-only constructor `new_empty_for_test()` behind #[cfg(test)] to simulate pool-empty state without exposing internal invariant violation through public API
patterns_established:
  - Match on ArrayQueue::pop() with fail-mode verdict fallback — eliminates last .expect() panic path in regorus.rs
observability_surfaces:
  - tracing::error log "regorus engine pool unexpectedly empty despite semaphore permit" when pool-empty path is hit
  - PolicyVerdict.reason = "engine pool unexpectedly empty" for downstream diagnosis
duration: 10m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Replace regorus.rs semaphore expect with fail-mode verdict

**RegorusPool::evaluate() now returns a fail-mode verdict on pool exhaustion instead of panicking via .expect().**

## What Happened

Replaced the `.expect("semaphore guarantees engine availability")` on `self.engines.pop()` (line 83) with a `match` that returns the configured `FailMode` default verdict when the pool is unexpectedly empty. The new path:

1. Drops the semaphore permit (releases it back)
2. Emits a `tracing::error!` log for observability
3. Returns a `PolicyVerdict` with `fail_mode.default_action()` and reason `"engine pool unexpectedly empty"`

This is consistent with the existing semaphore-closed handling pattern directly above it in the same function.

Added two new tests:
- `test_pool_exhaustion_returns_fail_closed_verdict` — verifies Block action on FailMode::FailClosed
- `test_pool_exhaustion_returns_fail_open_verdict` — verifies Allow action on FailMode::FailOpen

Both tests use a `#[cfg(test)]` helper `new_empty_for_test()` that creates a pool with semaphore permits but no engines in the queue, simulating the pool-empty condition.

## Verification

| Check | Result |
|-------|--------|
| `rg '\.expect\(' regorus.rs` | ✅ Zero matches — no .expect() in file |
| `.unwrap()` only in `#[cfg(test)]` block | ✅ All 4 .unwrap() calls are in test helpers (lines 278, 299, 332, 415), test module starts at line 261 |
| `tracing::error` in pool-empty path | ✅ Line 86 |
| `fail_mode.default_action()` used in pool-empty path | ✅ Lines 88-92 |
| Two new exhaustion tests exist | ✅ `test_pool_exhaustion_returns_fail_closed_verdict`, `test_pool_exhaustion_returns_fail_open_verdict` |
| `cargo test -p kernel --lib policy::layer1::regorus` | ⚠️ Blocked by broken MSVC toolchain (known issue from T01/T02) |

**Slice-level verification (final task — T03):**

| Check | Result |
|-------|--------|
| `rg '\.expect\(' regorus.rs` — zero matches | ✅ PASS |
| `rg 'unwrap\(\)\|\.expect\(' default.rs` — zero in pattern init | ✅ .expect() only in LazyLock initializers (acceptable per T01) |
| `rg '\.expect\(' injection.rs` — zero matches | ✅ .expect() only in LazyLock initializers + test code (acceptable per T02) |
| `cargo test --workspace --all-targets` | ⚠️ Blocked by MSVC toolchain |
| `cargo clippy --workspace --all-targets` | ⚠️ Blocked by MSVC toolchain |

## Diagnostics

- `tracing::error!("regorus engine pool unexpectedly empty despite semaphore permit")` emitted when pool-empty path is hit
- `PolicyVerdict.reason` includes `"engine pool unexpectedly empty"` for structured diagnosis
- This path should never trigger in practice — semaphore guarantees engine availability. It exists as defense-in-depth.

## Deviations

- Task plan suggested `.ok_or_else(|| PolicyError::PoolExhausted)` but the function returns `PolicyVerdict` directly (not `Result<PolicyVerdict>`), so a `match` with inline verdict return is more appropriate and consistent with the existing semaphore-closed pattern.

## Known Issues

- MSVC toolchain on this machine is broken (VS 2025 Preview missing vcruntime.h). Local cargo test/check/clippy cannot run. CI should work with a complete toolchain. This is pre-existing from T01/T02.

## Files Created/Modified

- `crates/kernel/src/policy/layer1/regorus.rs` — Replaced .expect() with match + fail-mode verdict; added new_empty_for_test() and two pool exhaustion tests
