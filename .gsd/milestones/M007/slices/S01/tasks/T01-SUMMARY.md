---
id: T01
parent: S01
milestone: M007
provides:
  - relay.rs error-path and flush-timeout test coverage (4 new tests)
key_files:
  - crates/kernel/src/proxy/relay.rs
key_decisions:
  - ErrorReader/ErrorWriter custom AsyncRead/AsyncWrite adapters for IO error injection
  - tokio::time::pause() for deterministic flush-timeout testing
patterns_established:
  - ErrorReader struct pattern for injecting read errors after N good bytes
  - ErrorWriter struct pattern for injecting write failures
observability_surfaces:
  - Test names map 1:1 to error branches: flush-timeout, read-error, write-error, outbound-redact
  - Error messages verified with prefix assertions ("read error:", "write error:")
duration: 5m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Add relay.rs error path and flush-timeout unit tests

**Added 4 unit tests covering flush-timeout, read error, write error, and outbound redaction paths in relay.rs — total relay tests now 14.**

## What Happened

All 4 tests were already implemented in a prior session. This execution verified they exist, compile, pass, and meet every must-have:

1. `test_flush_timeout_triggers_inspect_and_forward` — Uses `tokio::time::pause()` + `advance(60ms)` to deterministically trigger the `FLUSH_TIMEOUT` (50ms) branch. Writes data without closing the write side, advances time past timeout, then drops to trigger EOF. Verifies all 20 bytes forwarded.
2. `test_read_error_propagation` — `ErrorReader` struct delivers good bytes then returns `ConnectionReset`. Asserts error contains "read error" and "injected read error".
3. `test_write_error_propagation` — `ErrorWriter` struct fails on first `write_all`. Asserts error contains "write error" and "injected write error".
4. `test_inspecting_relay_outbound_redact` — SSN pattern at `base_confidence: 0.9` triggers `VerdictAction::Redact` (not Block). Verifies SSN is absent from output and output is non-empty.

## Verification

- `cargo test -p kernel relay -- --nocapture`: **14 tests passed** (10 existing + 4 new), 0 failed
- `cargo clippy -p kernel -- -D warnings`: **clean** — no warnings
- `cargo test -p kernel relay -- --list`: confirmed exactly 14 test functions in `proxy::relay::tests`

### Slice-level checks (partial — T01 is first of 4 tasks):
- ✅ `cargo test -p kernel relay -- --nocapture` — all relay.rs tests pass
- ⬜ `cargo test -p kernel streaming_relay -- --nocapture` — T02 scope
- ⬜ `cargo test -p kernel tls -- --nocapture` — T03 scope
- ⬜ `cargo test -p kernel --test integration_tests -- --nocapture` — T04 scope
- ⬜ Combined ≥35 total tests — pending T02–T04

## Diagnostics

- Run `cargo test -p kernel relay -- --nocapture` to see byte counts and redaction actions in test output
- Each test name identifies the exact branch exercised — failures pinpoint the specific error path that regressed
- Error prefix assertions ("read error:", "write error:") verify error messages are descriptive, not swallowed

## Deviations

None. All 4 tests matched the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/src/proxy/relay.rs` — 4 new test functions + ErrorReader/ErrorWriter structs in `#[cfg(test)]` module (already present from prior session)
