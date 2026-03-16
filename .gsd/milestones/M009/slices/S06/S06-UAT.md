# S06: Proto Safety, Observability & Testing — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are verifiable via automated tests (cargo test, bun test, vitest), lint tools (buf lint, clippy), and curl against metrics endpoints. No human-experience or live-runtime verification required beyond what tests exercise.

## Preconditions

- Repository checked out at M009 branch with all S06 task changes applied
- Rust toolchain installed (cargo, clippy, rustfmt)
- Bun installed (for control-plane tests)
- Node.js + npm installed (for vitest/dashboard tests)
- buf CLI installed (for proto linting)
- No services need to be running — all tests use in-process mocks

## Smoke Test

Run `cargo test --workspace --all-targets && bun test && npx vitest run && buf lint` from worktree root. All pass with zero new failures.

## Test Cases

### 1. Deprecated proto fields reject non-empty content

1. Open `proto/interdict/evidence/v1/evidence.proto`
2. Verify fields 10 (`prompt_text`) and 11 (`response_text`) have `(buf.validate.field).string.max_len = 0`
3. Run `buf lint`
4. **Expected:** Clean exit (0), no warnings about max_len=0

### 2. Timestamp nanos safe casts

1. Open `crates/evidence-collector/src/grpc/service.rs`
2. Search for `try_from` near timestamp nanos assignment
3. **Expected:** `u32::try_from(timestamp.nanos).unwrap_or(0)` — no bare `as u32` cast
4. Open `crates/kernel/src/evidence/bundle.rs`
5. Search for `try_from` near subsec_nanos
6. **Expected:** `i32::try_from(ts.timestamp_subsec_nanos()).expect("subsec_nanos 0..999_999_999 fits i32")` — no bare `as i32` cast

### 3. PEM ASN.1 OID validation

1. Run `cargo test -p evidence-collector -- signing::tests::test_decode_pem`
2. **Expected:** 3 tests pass: `test_decode_pem_valid_pkcs8`, `test_decode_pem_invalid_oid`, `test_decode_pem_raw_32_byte`
3. Inspect `test_decode_pem_invalid_oid` — confirms that a 48-byte payload with wrong OID returns `SigningError` mentioning "unrecognized PKCS8 key type"

### 4. Flaky kernel test determinism

1. Run `cargo test -p kernel -- queue --test-threads=1` three consecutive times
2. **Expected:** All runs pass with 0 failures
3. Verify no `sleep` calls remain in queue test functions (search for `sleep` in queue.rs test module)
4. **Expected:** Zero `sleep` calls in `#[cfg(test)]` module — all replaced with `rx.recv().await`

### 5. Merkle proof generation and verification

1. Run `cargo test -p evidence-collector -- merkle::tests::test_proof_for_bundle`
2. **Expected:** Passes — proof generated for existing hash at known index
3. Run `cargo test -p evidence-collector -- merkle::tests::test_proof_for_missing_hash`
4. **Expected:** Passes — returns None for non-existent hash
5. Run `cargo test -p evidence-collector -- merkle::tests::test_proof_for_single_leaf`
6. **Expected:** Passes — single-leaf tree proof works
7. Run `cargo test -p interdict-verify -- merkle::tests::test_verify_bundle_proof`
8. **Expected:** Passes — valid proof verifies against root
9. Run `cargo test -p interdict-verify -- merkle::tests::test_verify_bundle_proof_corrupted`
10. **Expected:** Passes — corrupted proof bytes return false (no panic)

### 6. Roundtrip integration test

1. Run `cargo test -p evidence-collector -- roundtrip`
2. **Expected:** 1 test passes, proving: 5 bundles created → chained → Merkle tree built → proofs generated for all 5 → each proof verified → root verified against full set → non-existent hash returns None → corrupted proof fails verification

### 7. Evidence-collector Prometheus /metrics endpoint

1. Run `cargo test -p evidence-collector -- metrics::tests::test_render_prometheus_format`
2. **Expected:** Passes — output contains `# HELP`, `# TYPE`, and value lines for all 6 counters
3. Run `cargo test -p evidence-collector -- metrics::tests::test_render_prometheus_empty`
4. **Expected:** Passes — zero-value counters render correctly
5. Run `cargo test -p evidence-collector -- metrics::tests::test_serve_metrics_get`
6. **Expected:** Passes — HTTP GET /metrics returns 200 with text/plain content-type
7. Run `cargo test -p evidence-collector -- metrics::tests::test_serve_metrics_404`
8. **Expected:** Passes — non-/metrics path returns 404

### 8. Control-plane Prometheus /metrics endpoint

1. Run `cd control-plane && bun test src/metrics.test.ts`
2. **Expected:** 4 tests pass:
   - `/metrics` returns 200 status
   - Response has text/plain content-type
   - Counter increments after requests
   - No collectDefaultMetrics crash (Bun compatibility)

### 9. Prometheus scrape config

1. Open `monitoring/prometheus/prometheus.yml`
2. Verify control-plane job targets `control-plane:3000` with `metrics_path: /metrics`
3. Verify evidence-collector job targets `evidence-collector:9090` with `metrics_path: /metrics`
4. **Expected:** Both jobs target `/metrics` path on correct ports (not `/health` or `/probe`)

### 10. Vitest mock hoisting fix

1. Run `npx vitest run` from `dashboard/`
2. **Expected:** 55 test files, 415 tests pass, zero mock hoisting warnings in output
3. Open `dashboard/src/__tests__/helpers/next-mocks.ts`
4. **Expected:** `vi.mock("next/headers", ...)` at module scope (top level), not inside `mockNextHeadersCookies()`

### 11. Full workspace cargo verification

1. Run `cargo clippy --workspace --all-targets -- -D warnings`
2. **Expected:** Clean — no warnings
3. Run `cargo fmt --all -- --check`
4. **Expected:** Clean — no formatting diffs

## Edge Cases

### Negative timestamp nanos

1. The `u32::try_from` on a negative `nanos` value returns `Err`, triggering `unwrap_or(0)`
2. **Expected:** No panic, nanos clamped to 0 silently

### PEM with unrecognized 48-byte payload

1. Covered by `test_decode_pem_invalid_oid` — a 48-byte payload that isn't Ed25519 PKCS8
2. **Expected:** Returns `SigningError` with descriptive message, does not extract garbage key bytes

### Merkle proof for non-existent bundle

1. Covered by `test_proof_for_missing_hash` and roundtrip test's negative case
2. **Expected:** Returns `None`, no panic

### Corrupted Merkle proof bytes

1. Covered by `test_verify_bundle_proof_corrupted` and roundtrip test
2. **Expected:** Returns `false`, no panic

### Elysia empty request.url in lifecycle hooks

1. Mitigated by using Elysia's `path` context property instead of parsing `request.url`
2. **Expected:** Path labels correctly populated in Prometheus metrics even when request.url is empty

## Failure Signals

- `buf lint` outputs errors about max_len constraint → proto field change not applied correctly
- `cargo test -p kernel -- queue` flakes on repeated runs → notification channel not wired properly
- `cargo test -p evidence-collector -- roundtrip` fails → chain, signature, or Merkle pipeline broken
- `cargo test -p evidence-collector -- metrics` fails → Prometheus text format invalid or HTTP listener broken
- `bun test src/metrics.test.ts` crashes → prom-client collectDefaultMetrics called (Bun incompatibility)
- `npx vitest run` shows mock hoisting warning → vi.mock not at module scope
- `cargo clippy` warnings → new code doesn't meet workspace lint standards

## Requirements Proved By This UAT

- FH-QUALITY-01 — Flaky test determinism (test case 4: three consecutive runs with zero failures)
- FH-OBSERVABILITY-01 — Prometheus metrics on both services (test cases 7, 8, 9)
- FH-TESTING-01 — Merkle proof generation/verification and roundtrip test (test cases 5, 6)

## Not Proven By This UAT

- Live Prometheus scraping from a real Prometheus instance — metrics format is validated by unit tests but actual scrape/pull cycle not exercised
- Rate limiter rejection counter wiring — counter is registered but not yet incremented on 429 responses
- Production runtime metrics accuracy under load — counters verified in unit test isolation only

## Notes for Tester

- The 4 pre-existing `bun test` failures (`exchangeApiKeyForSession` not implemented) are not related to S06 and should be ignored.
- Queue flakiness test (case 4) should be run with `--test-threads=1` to match CI conditions. Running 3 times is the minimum — 10 runs gives higher confidence.
- Metrics HTTP tests use ephemeral port binding, so no port conflicts should occur during testing.
