---
estimated_steps: 4
estimated_files: 2
---

# T04: Add integration test for content inspection through CONNECT tunnel

**Slice:** S01 — Hot-Path Relay Testing
**Milestone:** M007

## Description

Existing integration tests cover CONNECT tunneling (connect_tunnel.rs, 4 tests) and streaming relay (streaming.rs, 3 tests) separately. No test proves the full wired path: client connects through a CONNECT tunnel, content is inspected by `ContentInspector`, and PII in the relayed data is redacted or blocked. This is the integration capstone that validates the relay modules work together through the real proxy dispatch path in connect.rs.

## Steps

1. Review `TestProxy` and `TestProxyConfig` in helpers.rs to understand how `content_inspector` is wired (the field exists per research but verify its integration)
2. Review existing connect_tunnel.rs tests to understand the CONNECT flow setup pattern
3. Add `test_connect_tunnel_with_content_inspection` — configure `TestProxy` with a `ContentInspector` containing SSN/credit-card patterns, establish a CONNECT tunnel to a mock upstream server, send HTTP request body containing a test SSN through the tunnel, verify the response shows the SSN was redacted or the connection was blocked depending on policy confidence
4. If `TestProxy` doesn't fully wire `content_inspector` into the CONNECT handler, add the minimal wiring needed (this should be a few lines following the existing pattern in connect.rs)

## Must-Haves

- [ ] Integration test proves content inspection works through the CONNECT tunnel
- [ ] Test uses realistic PII pattern that triggers redaction or blocking
- [ ] All existing integration tests continue to pass

## Verification

- `cargo test -p kernel --test integration_tests -- --nocapture` — all integration tests pass including the new one
- `cargo clippy -p kernel -- -D warnings` — no new warnings

## Inputs

- `crates/kernel/tests/integration_tests/helpers.rs` — `TestProxy`, `TestProxyConfig` with `content_inspector` field
- `crates/kernel/tests/integration_tests/connect_tunnel.rs` — existing CONNECT tunnel test patterns
- `crates/kernel/src/proxy/connect.rs` — real dispatch logic that routes to `inspecting_relay_outbound`/`inspecting_relay_inbound` when inspector is present

## Expected Output

- `crates/kernel/tests/integration_tests/connect_tunnel.rs` — 1 new integration test function
- `crates/kernel/tests/integration_tests/helpers.rs` — possibly minor wiring additions if needed

## Observability Impact

- **Test output**: `cargo test -p kernel --test integration_tests -- test_connect_tunnel_with_content_inspection --nocapture` prints the response body showing redacted content vs original PII — confirms the outbound inspector replaced the email before it reached upstream.
- **Failure visibility**: Test name `test_connect_tunnel_with_content_inspection` pinpoints content-inspection-through-CONNECT as the failing path. Assertion messages show the actual response body on failure, making root cause immediately visible.
- **Diagnostic surface**: The echo backend pattern (request body echoed as response) makes outbound redaction observable through the response — no need to instrument the proxy internals to verify content was modified.
