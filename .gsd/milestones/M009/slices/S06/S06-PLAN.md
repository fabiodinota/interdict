# S06: Proto Safety, Observability & Testing

**Goal:** Deprecated proto fields reject non-empty content. Flaky kernel test is deterministic. Timestamp nanos uses safe cast. PEM parser validates ASN.1. Merkle proof generation and verification work for individual bundles. Collector→verifier roundtrip integration test passes. Prometheus metrics endpoints on evidence-collector (9090) and control-plane expose pipeline health, HTTP request rates, and rate limit stats. Vitest mock hoisting warning fixed.

**Demo:** `buf lint` clean with `max_len = 0` on deprecated fields. `cargo test -p kernel` passes 10 consecutive runs with zero flakes. `curl localhost:9090/metrics` returns Prometheus counters from evidence-collector. `curl localhost:3000/metrics` returns Prometheus counters from control-plane. Roundtrip integration test proves chain + signature + Merkle proof verification.

## Must-Haves

- Proto `prompt_text` and `response_text` fields have `max_len = 0` rejecting non-empty content
- `timestamp.nanos as u32` replaced with `u32::try_from().unwrap_or(0)` in service.rs
- `timestamp_subsec_nanos() as i32` replaced with explicit `i32::try_from().expect()` in bundle.rs
- PEM `decode_pem()` validates Ed25519 PKCS8 ASN.1 OID before extracting key bytes
- Flaky kernel review queue tests use notification channel instead of `sleep(50ms)`
- `MerkleAnchor::proof_for_bundle()` generates inclusion proofs from `chain_hashes`
- `interdict-verify` `verify_bundle_proof()` validates proofs against expected root
- Roundtrip integration test creates bundles → signs → chains → generates Merkle proofs → verifies all
- Evidence-collector HTTP `/metrics` on port 9090 with pipeline health counters
- Control-plane `/metrics` route with HTTP request and rate limit counters
- Prometheus scrape config updated for both services
- `vi.mock("next/headers")` moved to module-level scope in `next-mocks.ts`

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (all verifiable via unit/integration tests and buf lint)
- Human/UAT required: no

## Verification

- `buf lint` — clean after `max_len = 0` change
- `cargo build --workspace` — passes (proto change propagates)
- `cargo test -p kernel --test-threads=1` — passes deterministically (no sleep-based flakes)
- `cargo test -p evidence-collector` — all existing + new tests pass (Merkle proofs, roundtrip, metrics)
- `cargo test -p interdict-verify` — Merkle proof verification tests pass
- `cargo test --workspace --all-targets` — zero failures
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- `bun test` (control-plane/) — passes with metrics module tests
- `npx vitest run` (dashboard/) — passes with zero mock hoisting warnings
- `buf lint` — clean

## Observability / Diagnostics

- Runtime signals: Prometheus counter lines on `/metrics` (evidence-collector:9090, control-plane:3000), `tracing::warn` on PEM OID mismatch, `tracing::warn` on negative timestamp nanos
- Inspection surfaces: `curl :9090/metrics` for collector pipeline health, `curl :3000/metrics` for control-plane request stats
- Failure visibility: counter values expose pipeline health (dead_lettered > 0 = data loss risk), request rate anomalies visible via rate counter
- Redaction constraints: no secrets exposed in metrics — only numeric counters and labels

## Integration Closure

- Upstream surfaces consumed: S01's `WriterHealth` (Arc<WriterHealth> from `ClickHouseWriter::health()`), S01's `MerkleAnchor.chain_hashes` (from builder finalize), S03's rate limiter (counter instrumentation)
- New wiring introduced: TCP listener on :9090 spawned from evidence-collector main.rs, `/metrics` GET route on control-plane Elysia app, Prometheus scrape targets updated
- What remains before milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [x] **T01: Proto max_len=0, timestamp safe cast, PEM ASN.1 validation** `est:30m`
  - Why: Three surgical safety fixes — proto deprecated field rejection, timestamp overflow prevention, key format validation. Unblocks `buf lint` and `cargo clippy` gates.
  - Files: `proto/interdict/evidence/v1/evidence.proto`, `crates/evidence-collector/src/grpc/service.rs`, `crates/kernel/src/evidence/bundle.rs`, `crates/evidence-collector/src/signing/local.rs`
  - Do: Change `max_len = 1048576` to `max_len = 0` on fields 10 and 11 in evidence.proto. Replace `timestamp.nanos as u32` with `u32::try_from(timestamp.nanos).unwrap_or(0)` in service.rs:302. Replace `ts.timestamp_subsec_nanos() as i32` with `i32::try_from(ts.timestamp_subsec_nanos()).expect("subsec_nanos fits i32")` in bundle.rs:57. In local.rs `decode_pem()`, after base64 decode, check if payload is 48 bytes (PKCS8 Ed25519 envelope) — validate OID bytes at positions 7-11 match `[0x06, 0x03, 0x2b, 0x65, 0x70]` (OID 1.3.101.112) before extracting key. Reject with `SigningError` if OID doesn't match. Fall through to existing raw-key handling for 32/64-byte payloads. Add unit test for valid PKCS8, invalid OID, and raw key passthrough.
  - Verify: `buf lint`, `cargo build --workspace`, `cargo test -p evidence-collector`, `cargo test -p kernel`, `cargo clippy --workspace --all-targets -- -D warnings`
  - Done when: all four commands pass clean
- [ ] **T02: Fix flaky kernel review queue tests with notification channel** `est:30m`
  - Why: 4 tests in queue.rs use `sleep(50ms)` for synchronization, causing intermittent CI failures. Replace with a deterministic notification channel. Addresses FH-QUALITY-01.
  - Files: `crates/kernel/src/policy/layer3/queue.rs`
  - Do: Add `#[cfg(test)] pub escalation_ready: Option<tokio::sync::watch::Sender<()>>` field to `ReviewQueue`. In `escalate()`, after `self.pending.insert()` completes, send on the channel if present. In tests, create `tokio::sync::watch::channel(())`, pass the sender to `ReviewQueue`, and `rx.changed().await` instead of `sleep(50ms)`. Ensure the channel is `Option<Sender>` so production code (where it's `None`) has zero overhead. Update all 4 tests at lines ~290, ~362, ~455, ~490.
  - Verify: `cargo test -p kernel -- queue --test-threads=1` run 10 times with no failures
  - Done when: zero flaky failures across 10 consecutive runs
- [ ] **T03: Merkle proof generation, verification, and roundtrip integration test** `est:45m`
  - Why: Proves individual bundle inclusion in Merkle tree (FH-TESTING-01). The roundtrip test exercises the full collector→verifier pipeline including chain, signature, and Merkle verification.
  - Files: `crates/evidence-collector/src/merkle/builder.rs`, `crates/interdict-verify/src/merkle.rs`, `crates/interdict-verify/src/lib.rs`, `crates/evidence-collector/tests/roundtrip_test.rs`
  - Do: Add `MerkleAnchor::proof_for_bundle(bundle_hash: &[u8; 32]) -> Option<MerkleProofData>` that rebuilds a `MerkleTree` from `chain_hashes`, finds the leaf index by scanning, and returns proof bytes + leaf_index + total_leaves + root via `rs_merkle` `MerkleTree::proof()`. Define `MerkleProofData` struct. In interdict-verify merkle.rs, add `verify_bundle_proof(proof_bytes, leaf_hash, leaf_index, total_leaves, expected_root) -> bool` using `MerkleProof::<Sha256>::from_bytes()` and `.verify()`. Add unit tests for both (proof gen + verification roundtrip, missing hash returns None, single-leaf tree). Write `roundtrip_test.rs`: create N bundles with chain hashes → add to MerkleBuilder → finalize → for each bundle generate proof → verify proof against root → use interdict-verify to verify chain + signatures + Merkle root.
  - Verify: `cargo test -p evidence-collector -- roundtrip`, `cargo test -p interdict-verify`, `cargo test -p evidence-collector -- merkle`
  - Done when: roundtrip test passes end-to-end with chain, signature, and Merkle proof verification
- [ ] **T04: Evidence-collector Prometheus /metrics endpoint** `est:40m`
  - Why: Evidence-collector has no observability surface beyond logs. A `/metrics` endpoint on port 9090 exposes pipeline health counters for Prometheus scraping (FH-OBSERVABILITY-01).
  - Files: `crates/evidence-collector/src/metrics.rs` (new), `crates/evidence-collector/src/main.rs`, `crates/evidence-collector/src/lib.rs` or `mod.rs`, `crates/evidence-collector/src/grpc/service.rs`
  - Do: Create `metrics.rs` with `CollectorMetrics` struct holding `Arc<WriterHealth>` + additional `AtomicU64` counters: `bundles_received`, `merkle_anchors_written`, `signing_operations`. Implement `CollectorMetrics::render_prometheus() -> String` that produces Prometheus text exposition format (`# HELP`, `# TYPE`, value lines) for all counters. Add `serve_metrics(metrics: Arc<CollectorMetrics>, port: u16)` async function using `tokio::net::TcpListener` — read HTTP request, return 200 text/plain with metrics body for GET /metrics, 404 otherwise. In main.rs, create `Arc<CollectorMetrics>` wrapping the existing `WriterHealth`, spawn `serve_metrics` as a tokio task alongside the gRPC server. Pass `Arc<CollectorMetrics>` to `EvidenceService` for `bundles_received` increment in `process_bundle()`. Add unit test for `render_prometheus()` output format validation and integration test for HTTP response. Hand-roll the text format (no `prometheus` crate dependency — counters only, see D073).
  - Verify: `cargo test -p evidence-collector -- metrics`, `cargo build --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`
  - Done when: unit test proves valid Prometheus text format, HTTP listener test proves /metrics returns 200 with correct content-type
- [ ] **T05: Control-plane Prometheus, vitest mock fix, scrape config update** `est:40m`
  - Why: Completes FH-OBSERVABILITY-01 with control-plane metrics. Fixes the vitest mock hoisting warning. Updates Prometheus scrape config to target real /metrics endpoints.
  - Files: `control-plane/package.json`, `control-plane/src/metrics.ts` (new), `control-plane/src/index.ts`, `control-plane/src/__tests__/metrics.test.ts` (new), `monitoring/prometheus/prometheus.yml`, `dashboard/src/__tests__/helpers/next-mocks.ts`
  - Do: Install `prom-client` in control-plane. Create `metrics.ts` with custom metrics only (NO `collectDefaultMetrics()` — crashes Bun): `http_requests_total` Counter (labels: method, path, status), `http_request_duration_seconds` Histogram (labels: method, path), `rate_limit_rejections_total` Counter. Export `metricsRegistry` and `requestMetricsHook` (onBeforeHandle records start time, onAfterHandle increments counter + observes duration). In index.ts, add `.get("/metrics", ...)` route before auth plugin that calls `register.metrics()`. Wire hooks for request counting. Write `metrics.test.ts`: verify `/metrics` returns 200 with text/plain, verify counter increments after requests, verify no `collectDefaultMetrics` crash. Update `prometheus.yml`: change control-plane metrics_path from `/health` to `/metrics`, change evidence-collector to target `evidence-collector:9090` with metrics_path `/metrics`. Fix `next-mocks.ts`: move `vi.mock("next/headers", ...)` from inside `mockNextHeadersCookies()` to module-level scope; have the function only configure the mock's return values via a module-level mutable store.
  - Verify: `cd control-plane && bun test`, `npx vitest run` (in dashboard/), `buf lint`
  - Done when: bun test passes with metrics tests, vitest passes with zero mock hoisting warnings, prometheus.yml targets correct endpoints

## Files Likely Touched

- `proto/interdict/evidence/v1/evidence.proto`
- `crates/evidence-collector/src/grpc/service.rs`
- `crates/kernel/src/evidence/bundle.rs`
- `crates/evidence-collector/src/signing/local.rs`
- `crates/kernel/src/policy/layer3/queue.rs`
- `crates/evidence-collector/src/merkle/builder.rs`
- `crates/interdict-verify/src/merkle.rs`
- `crates/interdict-verify/src/lib.rs`
- `crates/evidence-collector/tests/roundtrip_test.rs` (new)
- `crates/evidence-collector/src/metrics.rs` (new)
- `crates/evidence-collector/src/main.rs`
- `control-plane/package.json`
- `control-plane/src/metrics.ts` (new)
- `control-plane/src/index.ts`
- `control-plane/src/__tests__/metrics.test.ts` (new)
- `monitoring/prometheus/prometheus.yml`
- `dashboard/src/__tests__/helpers/next-mocks.ts`
