# S01: Hot-Path Relay Testing

**Goal:** relay.rs, streaming_relay.rs, and tls.rs have ≥80% line coverage with targeted tests covering error paths, timeout behaviors, concurrency, and uncovered function signatures.
**Demo:** `cargo test -p kernel relay streaming_relay tls` passes with ~40 tests (up from 21), covering flush-timeout, read/write error injection, partial-match hold-then-release, load_ca() file I/O, and concurrent cert cache access.

## Must-Haves

- relay.rs flush-timeout accumulator path tested with `tokio::time::pause()`
- relay.rs read error and write error propagation tested
- streaming_relay.rs partial-match hold-then-release flow tested (or boundary-split equivalent documented if StreamingDetector can't produce PartialMatch for constructible patterns)
- streaming_relay.rs multiple sequential redactions tested
- tls.rs `load_ca()` tested with valid CA, missing file, and invalid PEM via tempfile
- tls.rs concurrent `get_or_create()` for same domain tested
- Integration test proves content inspection through CONNECT tunnel (PII sent → redacted/blocked)
- All new tests use existing helpers: `make_inspector_with_patterns()`, `generate_test_ca()`, `TestProxy`

## Verification

- `cargo test -p kernel relay -- --nocapture` — all relay.rs tests pass including new error/timeout tests
- `cargo test -p kernel streaming_relay -- --nocapture` — all streaming_relay.rs tests pass including partial-match tests
- `cargo test -p kernel tls -- --nocapture` — all tls.rs tests pass including load_ca() and concurrency tests
- `cargo test -p kernel --test integration_tests -- --nocapture` — integration tests pass including new content inspection test
- Combined: `cargo test -p kernel relay streaming_relay tls` passes with ≥35 total tests (was 21)

## Observability / Diagnostics

- Runtime signals: test assertions on error propagation paths — verifies that IO errors produce the expected `std::io::Error` variants, not silent swallowing
- Inspection surfaces: `cargo test` output with `--nocapture` shows relay byte counts, redaction actions, and timing
- Failure visibility: each test names the specific branch it covers (flush-timeout, read-error, write-error, partial-match, etc.) so failures pinpoint the exact gap
- Redaction constraints: test PII patterns are synthetic (e.g. `SSN-\d{3}-\d{2}-\d{4}`) — no real PII in test fixtures

## Integration Closure

- Upstream surfaces consumed: `make_inspector_with_patterns()` (relay.rs tests), `generate_test_ca()` (tls.rs tests), `TestProxy` + `TestProxyConfig` (integration_tests/helpers.rs)
- New wiring introduced in this slice: integration test that configures `TestProxy` with `content_inspector` field and sends inspectable traffic through CONNECT tunnel
- What remains before the milestone is truly usable end-to-end: S02 (evidence signing tests), S04 (coverage thresholds as CI gates), S08 (documentation)

## Tasks

- [x] **T01: Add relay.rs error path and flush-timeout unit tests** `est:45m`
  - Why: relay.rs has 10 tests covering happy paths but zero coverage of flush-timeout accumulator (lines ~119–131), read error propagation, write error handling, and outbound redaction
  - Files: `crates/kernel/src/proxy/relay.rs`
  - Do: Add ~4 tests: (1) flush-timeout using `tokio::time::pause()` + `tokio::time::advance()` with a reader that pauses mid-stream, (2) `ErrorReader` struct implementing `AsyncRead` that returns `io::Error` after N bytes for read-error test, (3) write-error test using `ErrorWriter` that fails on write, (4) outbound redaction path test using `inspecting_relay_outbound` with PII pattern. Use existing `make_inspector_with_patterns()` helper. Drop write sides of duplex streams to signal EOF.
  - Verify: `cargo test -p kernel relay -- --nocapture` passes with 14+ tests
  - Done when: flush-timeout, read-error, write-error, and outbound-redaction branches all have at least one passing test

- [x] **T02: Add streaming_relay.rs partial-match and multi-redaction tests** `est:30m`
  - Why: streaming_relay.rs has 5 tests but no coverage of partial-match hold-then-release flow, multiple sequential redactions across chunks, or channel drop during active relay
  - Files: `crates/kernel/src/proxy/streaming_relay.rs`
  - Do: Add ~3 tests: (1) partial-match test — send data that splits a pattern across chunk boundaries to trigger buffer holding, then complete with remaining data (if StreamingDetector can't produce PartialMatch for constructible patterns, document this and test the boundary-split equivalent), (2) multi-redaction test with chunks containing different PII categories, (3) rapid sender-drop test verifying relay completes gracefully when input channel closes mid-stream. Follow existing pattern of spawning relay in a task and collecting from receiver.
  - Verify: `cargo test -p kernel streaming_relay -- --nocapture` passes with 8+ tests
  - Done when: partial-match (or documented equivalent), multi-redaction, and channel-drop branches each have a passing test

- [x] **T03: Add tls.rs load_ca() and concurrent cache tests** `est:30m`
  - Why: `load_ca()` has 0% coverage (file I/O path), and concurrent `get_or_create()` for the same domain is untested despite being the primary contention scenario
  - Files: `crates/kernel/src/proxy/tls.rs`
  - Do: Add ~4 tests: (1) `load_ca()` with valid CA PEM generated by `rcgen` written to `tempfile`, verify returns valid `CertifiedKey`, (2) `load_ca()` with nonexistent path — verify error, (3) `load_ca()` with invalid PEM content — verify error, (4) concurrent `get_or_create()` — spawn N tasks requesting certs for the same domain simultaneously, verify all succeed and cache contains exactly 1 entry. Use `tempfile` crate (already in workspace) for file tests, `generate_test_ca()` helper for CA generation.
  - Verify: `cargo test -p kernel tls -- --nocapture` passes with 10+ tests
  - Done when: `load_ca()` has tests for valid/missing/invalid inputs, and concurrent cache access is proven safe

- [x] **T04: Add integration test for content inspection through CONNECT tunnel** `est:45m`
  - Why: No integration test exercises the full proxy relay flow with content inspection enabled — this is the real-world path where relay.rs + streaming_relay.rs + tls.rs work together
  - Files: `crates/kernel/tests/integration_tests/content_inspection.rs`, `crates/kernel/tests/integration_tests/main.rs`
  - Do: Create `content_inspection.rs` integration test module. Configure `TestProxy` with `content_inspector` (PII pattern for SSN-like strings). Stand up a mock upstream HTTPS server that responds with body containing synthetic PII. Send CONNECT request through proxy, read response, assert PII is redacted or connection is blocked (depending on confidence threshold). Add `mod content_inspection;` to main.rs. Use `TestProxyConfig` with `content_inspector` field per helpers.rs pattern.
  - Verify: `cargo test -p kernel --test integration_tests content_inspection -- --nocapture` passes
  - Done when: integration test proves PII flowing through CONNECT tunnel is detected and enforced by the content inspector

## Files Likely Touched

- `crates/kernel/src/proxy/relay.rs` (new tests in inline `#[cfg(test)]` module)
- `crates/kernel/src/proxy/streaming_relay.rs` (new tests in inline `#[cfg(test)]` module)
- `crates/kernel/src/proxy/tls.rs` (new tests in inline `#[cfg(test)]` module)
- `crates/kernel/tests/integration_tests/content_inspection.rs` (new file)
- `crates/kernel/tests/integration_tests/main.rs` (add `mod content_inspection;`)
