# S01: Hot-Path Relay Testing — UAT

**Milestone:** M007
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are Rust unit tests and integration tests — verification is deterministic `cargo test` execution, not runtime behavior or user experience

## Preconditions

- Rust toolchain installed (rustup with stable channel)
- Working directory is the interdict repo root
- `cargo build -p kernel` succeeds (dependencies resolved)
- No other process holding file locks on the test CA temp files

## Smoke Test

```bash
cargo test -p kernel -- relay streaming_relay tls --nocapture
```
Expected: ≥32 tests pass, 0 failures. Output shows byte counts, redaction actions, and TLS operations.

## Test Cases

### 1. Relay flush-timeout accumulator path

1. Run `cargo test -p kernel -- test_flush_timeout_triggers_inspect_and_forward --nocapture`
2. **Expected:** Test passes. Output shows 20 bytes forwarded after time is advanced past the 50ms FLUSH_TIMEOUT threshold. No real 50ms delay occurs (uses `tokio::time::pause()`).

### 2. Relay read error propagation

1. Run `cargo test -p kernel -- test_read_error_propagation --nocapture`
2. **Expected:** Test passes. Error message contains both "read error" and "injected read error", confirming the IO error is propagated with context rather than swallowed silently.

### 3. Relay write error propagation

1. Run `cargo test -p kernel -- test_write_error_propagation --nocapture`
2. **Expected:** Test passes. Error message contains both "write error" and "injected write error".

### 4. Relay outbound PII redaction

1. Run `cargo test -p kernel -- test_inspecting_relay_outbound_redact --nocapture`
2. **Expected:** Test passes. Output bytes are non-empty but the SSN pattern (`SSN-123-45-6789`) is absent from the forwarded data, proving the ContentInspector's Redact verdict was applied on the outbound path.

### 5. Streaming relay partial-match hold-then-release

1. Run `cargo test -p kernel -- test_relay_partial_match_hold_and_release --nocapture`
2. **Expected:** Test passes. The email `user@example.com` split across chunks ("user@exam" then "ple.com for info") is detected and redacted. Surrounding text "Contact" and "for info" survive in output.

### 6. Streaming relay multiple sequential redactions

1. Run `cargo test -p kernel -- test_relay_multiple_redactions_across_chunks --nocapture`
2. **Expected:** Test passes. Both EMAIL and SSN patterns sent in separate chunks are independently redacted. Labels "Email:" and "SSN:" survive in output.

### 7. Streaming relay sender-drop graceful completion

1. Run `cargo test -p kernel -- test_relay_handles_sender_drop_gracefully --nocapture`
2. **Expected:** Test passes with `Ok(())`. No panic. Clean data emitted through the flush-on-end path despite abrupt channel closure.

### 8. TLS load_ca() with valid PEM

1. Run `cargo test -p kernel -- test_load_ca_valid_pem --nocapture`
2. **Expected:** Test passes. `load_ca()` returns Ok with a usable CertifiedKey from PEM files written to tempfile.

### 9. TLS load_ca() with missing file

1. Run `cargo test -p kernel -- test_load_ca_missing_file --nocapture`
2. **Expected:** Test passes. `load_ca()` returns `ProxyError::Config` with message containing "failed to read CA cert".

### 10. TLS load_ca() with invalid PEM

1. Run `cargo test -p kernel -- test_load_ca_invalid_pem --nocapture`
2. **Expected:** Test passes. `load_ca()` returns ProxyError for unparseable PEM content.

### 11. TLS concurrent cache access

1. Run `cargo test -p kernel -- test_concurrent_get_or_create_same_domain --nocapture`
2. **Expected:** Test passes. 10 concurrent tasks all get valid certs for "concurrent.example.com". Cache contains exactly 1 entry after all tasks complete.

### 12. Integration: content inspection through CONNECT tunnel

1. Run `cargo test -p kernel --test integration_tests -- test_connect_tunnel_with_content_inspection --nocapture`
2. **Expected:** Test passes. Response body shows `{"prompt":"Contact ***************** for details"}` — 17 asterisks replacing `alice@example.com`. Proves the full path: client → CONNECT tunnel → TLS interception → ContentInspector → relay → upstream echo → response with redacted PII.

## Edge Cases

### Concurrent cert generation race

1. Run `cargo test -p kernel -- test_concurrent_get_or_create_same_domain --nocapture` repeatedly (5 times)
2. **Expected:** All runs pass. Cache always has exactly 1 entry. Concurrent callers may each generate a cert, but `DashMap::entry().or_insert()` ensures deterministic cache state.

### Full test suite regression check

1. Run `cargo test -p kernel --test integration_tests -- --nocapture`
2. **Expected:** All 88 integration tests pass. No regressions introduced by new echo backend or content inspection wiring.

### Clippy cleanliness

1. Run `cargo clippy -p kernel -- -D warnings`
2. **Expected:** Zero warnings. All new test code meets clippy standards.

## Failure Signals

- Any test failure in `cargo test -p kernel -- relay streaming_relay tls` — indicates a regression in hot-path relay behavior
- Test name contains the branch exercised (flush-timeout, read-error, write-error, partial-match, etc.) — failure pinpoints the exact code path
- Integration test failure with response body not containing asterisks — indicates ContentInspector not wired through CONNECT tunnel
- `cargo clippy` warnings — indicates code quality regression in new test code
- Panic in sender-drop test — indicates relay doesn't handle channel closure gracefully

## Requirements Proved By This UAT

- PR-TEST-01 (partially) — hot-path relay modules now have comprehensive unit test coverage; full validation requires S04 coverage gate enforcement

## Not Proven By This UAT

- Actual line coverage percentage (≥80%) — requires `cargo-llvm-cov` or equivalent, deferred to S04
- Performance impact of content inspection — no latency benchmarks in this slice
- Coverage enforcement as a CI gate — S04 scope
- Other PII pattern types through the full CONNECT tunnel (only EMAIL tested end-to-end; SSN and others tested at unit level only)

## Notes for Tester

- All tests use synthetic PII patterns (e.g. `SSN-\d{3}-\d{2}-\d{4}`, `user@example.com`) — no real PII in test fixtures
- The flush-timeout test uses `tokio::time::pause()` so it runs in microseconds, not actual 50ms
- The content inspection integration test starts real TCP listeners (TestProxy + MockBackend) on ephemeral ports — ensure no firewall blocks localhost TCP
- If `tempfile` tests fail with permission errors, check filesystem permissions in the temp directory
- The concurrent cache test spawns 10 tokio tasks — on resource-constrained CI, this is minimal overhead
