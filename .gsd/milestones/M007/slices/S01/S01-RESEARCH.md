# S01: Hot-Path Relay Testing — Research

**Date:** 2026-03-15

## Summary

The milestone context claimed relay modules had "zero tests" — this is outdated. All three files (`relay.rs`, `streaming_relay.rs`, `tls.rs`) already have substantial inline test modules: 10, 5, and 6 unit tests respectively, plus 7 integration tests across `connect_tunnel.rs` and `streaming.rs`. The existing tests cover core happy paths and several edge cases including cross-chunk pattern detection, cache eviction/TTL, stream severing, and buffer flush on end-of-stream.

The gap is in **error paths, timeout behaviors, concurrency, and uncovered function signatures**. Specific uncovered branches: `relay.rs` flush-timeout accumulator path (line ~119–131), read error propagation, write error handling; `streaming_relay.rs` partial-match hold-then-release flow, multiple sequential redactions; `tls.rs` `load_ca()` function (0% — file I/O dependent), `generate_server_config()` error paths, concurrent `get_or_create` under contention. The existing test count is 28 total (21 unit + 7 integration), and adding ~12–15 targeted tests should push coverage well past 80%.

## Recommendation

Add targeted unit tests for the specific uncovered branches identified below. Do NOT rewrite existing tests. Focus on:

1. **relay.rs**: Flush-timeout path (reader that pauses mid-stream to trigger `FLUSH_TIMEOUT`), read error injection, write error injection, outbound redaction path (currently only tested for inbound).
2. **streaming_relay.rs**: Partial-match hold-then-release (send content triggering `PartialMatch` followed by content that clears it), multiple chunks with different redaction categories, rapid channel drop during relay.
3. **tls.rs**: `load_ca()` with temp files (valid CA, missing file, invalid PEM), concurrent `get_or_create()` for same domain, insertion order correctness after re-access of existing domain.
4. **Integration**: Add an integration test for content inspection through the CONNECT tunnel (proxy with `ContentInspector` configured, sending PII that should be redacted/blocked).

Use the existing `make_inspector_with_patterns()` helper in relay.rs tests and the `generate_test_ca()` helper in tls.rs tests. For `load_ca()` tests, use `tempfile` (already in workspace deps) to create temp PEM files.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Building ContentInspector for tests | `make_inspector_with_patterns()` in relay.rs | Already handles all boilerplate for PatternRegistry + RedactionEngine + PolicyConfig |
| Generating test CA | `generate_test_ca()` in tls.rs tests | Configures proper CA params with DN, reuse everywhere |
| Test proxy infrastructure | `TestProxy` in integration_tests/helpers.rs | Full proxy instance with CA, cert cache, connection pool, allowlist, and optional ContentInspector |
| Mock async readers that error | `tokio::io::duplex` + custom `AsyncRead` impl | duplex for normal flows; `struct ErrorReader` for injecting IO errors |
| Temp file management | `tempfile` crate (workspace dep) | Automatic cleanup for `load_ca()` file-based tests |

## Existing Code and Patterns

- `crates/kernel/src/proxy/relay.rs` (614 lines) — 3 public functions: `bidirectional`, `inspecting_relay_outbound`, `inspecting_relay_inbound`. Private helper: `inspect_and_forward`. 10 unit tests cover happy paths and cross-chunk detection. Use the existing `make_inspector_with_patterns()` test helper.
- `crates/kernel/src/proxy/streaming_relay.rs` (386 lines) — `InspectingRelay` struct with `relay_with_inspection()`. Uses `mpsc::channel` for input/output. 5 unit tests cover passthrough, redaction, sever, empty stream, flush. Follows pattern of spawning relay in a task and collecting output from a receiver.
- `crates/kernel/src/proxy/tls.rs` (370 lines) — `load_ca()` (file-based, untested), `CertCache` with `get_or_create()`, `pre_warm()`. Private `generate_server_config()`. 6 unit tests cover caching, eviction, TTL. `len()` and `is_empty()` are `#[cfg(test)]`-gated for test observability.
- `crates/kernel/src/proxy/connect.rs` — Wires relay functions: uses `inspecting_relay_outbound` + `inspecting_relay_inbound` when content inspector is present, falls back to `bidirectional` otherwise. This is the integration point.
- `crates/kernel/tests/integration_tests/helpers.rs` — `TestProxy` supports `content_inspector` field in `TestProxyConfig` for integration tests with inspection. Already used by 7 integration tests.
- `crates/kernel/src/proxy/websocket.rs` (367 lines) — Separate module, has 9 tests (7 sync + 2 async). Not in scope for S01 per the slice description.

## Constraints

- **Build requires `msvc_spectre_libs`**: The `regorus` crate (OPA Rego engine) depends on `msvc_spectre_libs` which requires VS spectre-mitigated libraries. CI builds on Linux; local Windows dev needs the VS component installed. Tests must be validated in CI, not just locally.
- **`load_ca()` is file I/O**: Uses `std::fs::read_to_string` — needs real temp files, can't mock. Use `tempfile` crate for test PEM files. Generate test CA PEM with `rcgen`.
- **`FLUSH_TIMEOUT` is 50ms**: Testing the timeout path requires either a slow reader mock or `tokio::time::pause()` to control time. The timeout triggers data flush in bidirectional tunnels where EOF may not arrive.
- **`ContentInspector::new()` can fail**: The existing helper calls `.expect()` — fine for tests but means pattern construction must be valid.
- **No coverage tooling in CI yet**: S01 proves coverage manually via test enumeration. Coverage thresholds as CI gates are in S04 scope.
- **`StreamingDetector` scan returns 3 variants**: `NoMatch`, `PartialMatch`, `FullMatch(detections)`. The partial-match path is currently untested — it holds the buffer without emitting.

## Common Pitfalls

- **Duplex stream ordering** — `tokio::io::duplex` creates a pair of connected streams; writing to one side is read from the other. Drop the write side to signal EOF. Forgetting to drop causes tests to hang waiting for more data.
- **Timeout-dependent tests flake** — Tests asserting on flush-timeout behavior must use `tokio::time::pause()` to make time deterministic. Real-time tests on CI runners can be up to 10x slower than expected.
- **Pattern confidence thresholds** — `base_confidence: 1.0` triggers Block action, `0.9` triggers Redact. Tests must set the right confidence for the expected VerdictAction.
- **Channel buffer sizes** — `mpsc::channel(10)` in streaming_relay tests is generous for small chunks but could mask backpressure issues. Keep buffer sizes small in new tests to exercise realistic conditions.
- **`spawn_blocking` in cert generation** — `get_or_create()` uses `spawn_blocking` for CPU-bound cert generation. Under concurrent access for the same domain, two tasks may generate certs simultaneously before one caches it. This is safe (both succeed, one overwrites) but worth a test to confirm.

## Open Risks

- **Coverage measurement**: Without `cargo-llvm-cov` in CI, the ≥80% target is estimated from branch analysis, not measured. The slice proves test existence and branch coverage by inspection; automated coverage gates come in S04.
- **`PartialMatch` behavior depends on `StreamingDetector` internals**: If the detector never returns `PartialMatch` for the test patterns we construct, the partial-match test path can't be exercised at the unit level. May need to construct a pattern/input combination that specifically triggers partial detection.
- **Flake risk on timeout tests**: Even with `tokio::time::pause()`, the flush-timeout test in `relay.rs` depends on `tokio::time::timeout` internal behavior. If implementation changes, the test may need adjustment.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust | rust-skills | installed (project skill) |
| Tokio async testing | — | none found (standard tokio patterns suffice) |

## Sources

- relay.rs inline code review (614 lines, 10 tests, 3 public functions + 1 private helper)
- streaming_relay.rs inline code review (386 lines, 5 tests, 1 struct + 1 public method)
- tls.rs inline code review (370 lines, 6 tests, 1 public function + 1 struct with 3 public methods)
- connect.rs wiring review (lines 289–339: relay dispatch based on content inspector presence)
- Integration test review: streaming.rs (3 tests), connect_tunnel.rs (4 tests), helpers.rs (TestProxy infra)
- Build constraint: `regorus → msvc_spectre_libs` dependency chain (cargo tree output)
