---
id: T04
parent: S01
milestone: M007
provides:
  - integration test proving content inspection works end-to-end through CONNECT tunnel
  - MockBackend::echo() helper for request-body echo tests
  - TestProxy::create_echo_backend() convenience method
key_files:
  - crates/kernel/tests/integration_tests/connect_tunnel.rs
  - crates/kernel/tests/integration_tests/helpers.rs
key_decisions:
  - Used echo backend pattern (upstream returns request body as response) to make outbound redaction observable through the response — no proxy instrumentation needed
  - Used EMAIL pattern with RedactionEngine::empty() which replaces PII with asterisks of equal length — simpler than wiring category-tagged placeholders
patterns_established:
  - Echo backend pattern for verifying outbound content modification through CONNECT tunnels
  - ContentInspector integration test setup: PatternRegistry + RedactionEngine::empty() + PolicyConfig → ContentInspector → TestProxyConfig.content_inspector
observability_surfaces:
  - "cargo test -p kernel --test integration_tests -- test_connect_tunnel_with_content_inspection --nocapture" prints response body showing redacted PII
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T04: Add integration test for content inspection through CONNECT tunnel

**Added end-to-end integration test proving PII redaction works through the full CONNECT tunnel path: client → TLS interception → ContentInspector → relay → upstream echo → response**

## What Happened

Added `test_connect_tunnel_with_content_inspection` to connect_tunnel.rs. The test configures a `TestProxy` with a `ContentInspector` containing an EMAIL pattern, establishes a CONNECT tunnel to an echo backend, sends a JSON body containing `alice@example.com`, and verifies the response contains asterisks where the email was (proving the outbound relay redacted the PII before it reached upstream).

To support this, added `MockBackend::echo()` — a TLS-enabled mock backend that returns the request body as the response body — and `TestProxy::create_echo_backend()` as a convenience wrapper. The existing `TestProxy` wiring for `content_inspector` was already correct (via `svc.with_content_inspector()`) so no connect.rs changes were needed.

## Verification

- `cargo test -p kernel --test integration_tests -- --nocapture` — **88 tests pass** including the new one
- `cargo clippy -p kernel -- -D warnings` — zero warnings
- `cargo test -p kernel -- relay streaming_relay tls` — **39 unit tests pass** (slice target ≥35 met)
- Slice verification checks:
  - ✅ `cargo test -p kernel relay -- --nocapture` — all relay tests pass
  - ✅ `cargo test -p kernel streaming_relay -- --nocapture` — all streaming_relay tests pass
  - ✅ `cargo test -p kernel tls -- --nocapture` — all tls tests pass
  - ✅ `cargo test -p kernel --test integration_tests -- --nocapture` — 88 integration tests pass including new content inspection test
  - ✅ Combined relay/streaming_relay/tls: 39 total tests (was 21, target ≥35)

## Diagnostics

- Run `cargo test -p kernel --test integration_tests -- test_connect_tunnel_with_content_inspection --nocapture` to see the echoed response body with redacted content
- Response shows `{"prompt":"Contact ***************** for details"}` — 17 asterisks replacing `alice@example.com` (length-preserving redaction)
- Test assertions print the actual response body on failure, making root cause immediately visible

## Deviations

- Used asterisk-based redaction (via `RedactionEngine::empty()` + `create_placeholder`) instead of `[REDACTED:EMAIL]` tags — this is the actual runtime behavior when RedactionEngine has no category-specific rules configured. Updated test assertions accordingly.

## Known Issues

None.

## Files Created/Modified

- `crates/kernel/tests/integration_tests/connect_tunnel.rs` — added `test_connect_tunnel_with_content_inspection` integration test
- `crates/kernel/tests/integration_tests/helpers.rs` — added `MockBackend::echo()` and `TestProxy::create_echo_backend()`
- `.gsd/milestones/M007/slices/S01/tasks/T04-PLAN.md` — added Observability Impact section (pre-flight fix)
