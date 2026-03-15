---
id: T02
parent: S01
milestone: M007
provides:
  - streaming_relay.rs partial-match, multi-redaction, and channel-drop test coverage (3 new tests)
key_files:
  - crates/kernel/src/proxy/streaming_relay.rs
key_decisions:
  - Partial-match test uses EMAIL pattern with split "user@exam" / "ple.com" to trigger PartialMatch → hold → FullMatch → redact flow
  - Multi-redaction test uses EMAIL + SSN patterns in separate chunks to verify sequential independent redactions across buffer clears
patterns_established:
  - Partial-match boundary-split testing: send chunk ending with incomplete PII pattern, then complete it in the next chunk
  - Channel-drop resilience: send data then immediately drop sender, verify relay completes and emits processed data
observability_surfaces:
  - Test names map 1:1 to branches: partial-match-hold-and-release, multiple-redactions-across-chunks, sender-drop-gracefully
  - cargo test -p kernel streaming_relay -- --nocapture shows redaction actions and buffer behavior
duration: 5m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Add streaming_relay.rs partial-match and multi-redaction tests

**Added 3 unit tests covering partial-match hold-then-release, multi-pattern sequential redaction, and abrupt channel drop in streaming_relay.rs — total streaming_relay tests now 8.**

## What Happened

Added three tests to the existing `#[cfg(test)] mod tests` block in `streaming_relay.rs`:

1. `test_relay_partial_match_hold_and_release` — Sends "Contact user@exam" (partial email with @ but no TLD), which triggers `ScanResult::PartialMatch` and buffer holding. Follow-up chunk "ple.com for info" resolves to `FullMatch`. Verifies the email is redacted while surrounding text ("Contact", "for info") is preserved.

2. `test_relay_multiple_redactions_across_chunks` — Sends three chunks: first with EMAIL PII, second with SSN PII, third clean. Verifies both patterns are independently redacted (email and SSN absent from output) while labels ("Email:", "SSN:") survive.

3. `test_relay_handles_sender_drop_gracefully` — Sends one clean chunk then immediately drops the sender channel. Verifies the relay completes with `Ok(())` (no panic) and emits the processed data via the flush-on-end path.

## Verification

- `cargo test -p kernel streaming_relay -- --nocapture`: **8 tests passed** (5 existing + 3 new), 0 failed
- `cargo clippy -p kernel -- -D warnings`: **clean** — no warnings

### Slice-level checks (partial — T02 is second of 4 tasks):
- ✅ `cargo test -p kernel relay -- --nocapture` — all 14 relay.rs tests pass
- ✅ `cargo test -p kernel streaming_relay -- --nocapture` — all 8 streaming_relay.rs tests pass
- ⬜ `cargo test -p kernel tls -- --nocapture` — T03 scope
- ⬜ `cargo test -p kernel --test integration_tests -- --nocapture` — T04 scope
- ✅ Combined relay+streaming_relay+tls: 39 tests matching (≥35 target met)

## Diagnostics

- Run `cargo test -p kernel streaming_relay -- --nocapture` to see buffer behavior and redaction actions
- Each test name identifies the exact branch exercised — failures pinpoint the specific streaming_relay.rs path that regressed
- Partial-match test verifies the PartialMatch → buffer hold → FullMatch → redact flow end-to-end
- Multi-redaction test verifies buffer.clear() between redactions doesn't corrupt subsequent pattern detection

## Deviations

None. StreamingDetector produces PartialMatch for EMAIL patterns with "@" but no complete TLD, so the primary partial-match flow was directly testable as planned.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/src/proxy/streaming_relay.rs` — 3 new test functions in `#[cfg(test)]` module
- `.gsd/milestones/M007/slices/S01/tasks/T02-PLAN.md` — Added Observability Impact section (preflight fix)
