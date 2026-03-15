---
estimated_steps: 5
estimated_files: 1
---

# T01: Add relay.rs unit tests for flush-timeout, read error, and write error paths

**Slice:** S01 — Hot-Path Relay Testing
**Milestone:** M007

## Description

relay.rs has 10 unit tests covering bidirectional relay, cross-chunk pattern detection, and inbound/outbound inspection happy paths. But three important branches are untested: the flush-timeout accumulator path (lines ~119–131 where `tokio::time::timeout` returns `Err(_)`), read error propagation (line ~117 `Ok(Err(e))`), and write errors during forwarding. These are the error/edge paths that determine relay resilience under real network conditions.

## Steps

1. Read the existing test module in relay.rs to understand patterns (duplex streams, `make_inspector_with_patterns()` usage, EOF signaling via drop)
2. Add `test_flush_timeout_triggers_inspect_and_forward` — use `tokio::time::pause()` to control time, write data to one side of a duplex, advance time past `FLUSH_TIMEOUT` (50ms) without sending more data, verify accumulated content is flushed and forwarded
3. Add `test_read_error_propagation` — implement a small `ErrorReader` struct that implements `AsyncRead` and returns `io::Error` after N bytes, verify the relay returns the error string
4. Add `test_write_error_propagation` — implement a small `ErrorWriter` struct that implements `AsyncWrite` and fails on write, verify the relay surfaces the write error
5. Add `test_inspecting_relay_outbound_redact` — use `make_inspector_with_patterns()` with a PII pattern at lower confidence (0.9 for redact action), send matching content outbound, verify redaction occurs (existing tests only check allow and block for outbound)

## Must-Haves

- [ ] Flush-timeout path exercised with deterministic time control (`tokio::time::pause`)
- [ ] Read error propagation returns meaningful error
- [ ] Write error propagation returns meaningful error
- [ ] All existing 10 tests continue to pass

## Verification

- `cargo test -p kernel relay -- --nocapture` — all 14 tests pass (10 existing + 4 new)
- `cargo clippy -p kernel -- -D warnings` — no new warnings

## Inputs

- `crates/kernel/src/proxy/relay.rs` — existing test module with `make_inspector_with_patterns()` helper
- S01-RESEARCH.md — flush-timeout is 50ms, `tokio::time::pause()` required, base_confidence 0.9 triggers Redact

## Observability Impact

- **Test assertion coverage**: Each new test names the specific error/edge branch it exercises (flush-timeout, read-error, write-error, outbound-redact). Failures in `cargo test` output pinpoint exactly which branch regressed.
- **Error path visibility**: The read-error and write-error tests verify that `inspecting_relay_outbound` surfaces IO errors as descriptive `Err(String)` messages (not silent swallowing). A future agent can confirm error propagation by checking test assertions for "read error:" and "write error:" prefixes.
- **Timeout path**: The flush-timeout test uses `tokio::time::pause()` for deterministic time control — confirms that accumulated data is flushed and forwarded when no more bytes arrive within `FLUSH_TIMEOUT` (50ms). Flake-free by design.
- **Redaction action path**: The outbound-redact test proves `VerdictAction::Redact` works in the outbound relay (previously only tested inbound), verifying that PII is replaced, not blocked.

## Expected Output

- `crates/kernel/src/proxy/relay.rs` — 4 new test functions added to the existing `#[cfg(test)] mod tests` block
