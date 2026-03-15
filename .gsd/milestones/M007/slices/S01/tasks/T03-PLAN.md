---
estimated_steps: 5
estimated_files: 1
---

# T03: Add tls.rs unit tests for load_ca and concurrent cert generation

**Slice:** S01 — Hot-Path Relay Testing
**Milestone:** M007

## Description

`load_ca()` is the only public function in tls.rs with zero test coverage — it reads CA certificate and key from disk, which requires real file I/O. The concurrent `get_or_create()` path (where multiple tasks request certs for the same domain simultaneously) exercises the `spawn_blocking` + cache interaction that could theoretically produce race conditions. Both gaps are critical for production confidence in the TLS interception layer.

## Steps

1. Read the `load_ca()` implementation and `TlsConfig` struct to understand expected PEM format and error paths
2. Add `test_load_ca_valid_pem` — use `rcgen` to generate a CA cert/key, serialize to PEM, write to `tempfile::NamedTempFile`, construct a `TlsConfig` pointing to those paths, call `load_ca()`, verify Ok result
3. Add `test_load_ca_missing_file` — construct `TlsConfig` pointing to a nonexistent path, verify `load_ca()` returns an appropriate `ProxyError`
4. Add `test_load_ca_invalid_pem` — write garbage content to a tempfile, verify `load_ca()` returns `ProxyError` for invalid PEM
5. Add `test_concurrent_get_or_create_same_domain` — create a `CertCache`, spawn 10 concurrent `get_or_create()` tasks for the same domain, join all, verify all return Ok and `cache.len() == 1`

## Must-Haves

- [ ] `load_ca()` happy path tested with real temp files
- [ ] `load_ca()` missing file error tested
- [ ] `load_ca()` invalid PEM error tested
- [ ] Concurrent `get_or_create()` for same domain tested
- [ ] All existing 6 tests continue to pass

## Verification

- `cargo test -p kernel tls -- --nocapture` — all 10 tests pass (6 existing + 4 new)
- `cargo clippy -p kernel -- -D warnings` — no new warnings

## Inputs

- `crates/kernel/src/proxy/tls.rs` — existing test module with `generate_test_ca()` helper
- S01-RESEARCH.md — `tempfile` in workspace deps, `rcgen` available, `load_ca()` uses `std::fs::read_to_string`

## Expected Output

- `crates/kernel/src/proxy/tls.rs` — 4 new test functions added to the existing `#[cfg(test)] mod tests` block

## Observability Impact

- **Test assertion messages**: Each test name encodes the exact `load_ca()` path exercised (`valid_pem`, `missing_file`, `invalid_pem`) — failures pinpoint whether the issue is file I/O, PEM parsing, or cert reconstruction.
- **Error message assertions**: Tests verify that `ProxyError::Config` messages contain descriptive prefixes (`"failed to read CA cert"`, `"failed to parse"`) — regressions that swallow errors or change error shapes will fail these assertions.
- **Concurrency test**: `test_concurrent_get_or_create_same_domain` verifies that 10 parallel `get_or_create()` calls for the same domain result in exactly one cache entry — a race condition or cache corruption would surface as `cache.len() != 1`.
- **Diagnostic command**: `cargo test -p kernel tls -- --nocapture` shows all TLS test outcomes including temp-file paths and error messages.
