---
estimated_steps: 4
estimated_files: 1
---

# T02: Add streaming_relay.rs unit tests for partial-match, multi-redaction, and channel drop

**Slice:** S01 — Hot-Path Relay Testing
**Milestone:** M007

## Description

streaming_relay.rs has 5 tests covering passthrough, single redaction, sever, empty stream, and buffer flush. The partial-match hold-then-release flow (where `StreamingDetector::scan` returns `PartialMatch`, holding buffered data until the next chunk resolves it), multiple sequential redactions in a single stream, and abrupt channel closure during relay are untested.

## Steps

1. Read the existing test module to understand the spawn-relay-collect pattern, channel setup, and `InspectingRelay` configuration
2. Add `test_relay_partial_match_hold_and_release` — construct input that triggers a partial match (content that looks like it could be PII but isn't complete), then send a follow-up chunk that resolves the ambiguity. Verify the held data is eventually emitted correctly. If `StreamingDetector` doesn't produce `PartialMatch` for constructible patterns, document this and test the nearest equivalent edge (e.g., content split exactly at a pattern boundary)
3. Add `test_relay_multiple_redactions_across_chunks` — send multiple chunks each containing different PII patterns (e.g., SSN in chunk 1, credit card in chunk 2). Verify each is independently redacted in the output
4. Add `test_relay_handles_sender_drop_gracefully` — start a relay, send one chunk, then immediately drop the sender channel. Verify the relay completes without panic and emits whatever was successfully processed

## Must-Haves

- [ ] Partial-match or boundary-split behavior tested
- [ ] Multiple sequential redactions across chunks verified
- [ ] Graceful handling of abrupt channel drop verified
- [ ] All existing 5 tests continue to pass

## Verification

- `cargo test -p kernel streaming_relay -- --nocapture` — all 8 tests pass (5 existing + 3 new)
- `cargo clippy -p kernel -- -D warnings` — no new warnings

## Inputs

- `crates/kernel/src/proxy/streaming_relay.rs` — existing test module with relay spawn pattern
- S01-RESEARCH.md — `StreamingDetector` scan returns `NoMatch`, `PartialMatch`, `FullMatch(detections)`; partial-match path currently untested

## Observability Impact

- **New test names map 1:1 to untested branches:** `test_relay_partial_match_hold_and_release` (PartialMatch → buffer hold → resolve), `test_relay_multiple_redactions_across_chunks` (sequential FullMatch across buffer clears), `test_relay_handles_sender_drop_gracefully` (channel close during relay)
- **Failure pinpointing:** each test name identifies the exact streaming_relay.rs code path exercised — regressions in partial-match buffering, multi-pattern redaction, or channel lifecycle will name the broken path
- **Diagnostic command:** `cargo test -p kernel streaming_relay -- --nocapture` shows redaction actions and buffer behavior in real time
- **Redaction verification:** assertions confirm PII is absent from output while surrounding text is preserved — verifies redaction didn't swallow non-PII content

## Expected Output

- `crates/kernel/src/proxy/streaming_relay.rs` — 3 new test functions added to the existing `#[cfg(test)] mod tests` block
