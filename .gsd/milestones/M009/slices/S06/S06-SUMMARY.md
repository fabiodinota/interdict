---
id: S06
parent: M009
milestone: M009
provides:
  - Proto deprecated fields (prompt_text, response_text) reject non-empty content via max_len=0
  - Deterministic kernel review queue tests via mpsc notification channel (zero flakes)
  - Safe timestamp nanos casts (u32::try_from, i32::try_from) in service.rs and bundle.rs
  - PEM decode_pem() validates Ed25519 PKCS8 ASN.1 OID before key extraction
  - MerkleAnchor::proof_for_bundle() generates Merkle inclusion proofs from chain_hashes
  - interdict-verify verify_bundle_proof() validates proofs against expected root
  - Collector→verifier roundtrip integration test proving chain+signature+Merkle pipeline
  - Evidence-collector Prometheus /metrics on port 9090 with 6 pipeline health counters
  - Control-plane Prometheus /metrics on port 3000 with HTTP request and rate limit counters
  - Prometheus scrape config targeting real /metrics endpoints on both services
  - Vitest mock hoisting warning eliminated via module-level vi.mock
requires:
  - slice: S01
    provides: WriterHealth Arc with atomic counters (rows_written, retried, dead_lettered), MerkleAnchor.chain_hashes for proof generation
affects: []
key_files:
  - proto/interdict/evidence/v1/evidence.proto
  - crates/evidence-collector/src/grpc/service.rs
  - crates/kernel/src/evidence/bundle.rs
  - crates/evidence-collector/src/signing/local.rs
  - crates/kernel/src/policy/layer3/queue.rs
  - crates/evidence-collector/src/merkle/builder.rs
  - crates/interdict-verify/src/merkle.rs
  - crates/evidence-collector/tests/roundtrip_test.rs
  - crates/evidence-collector/src/metrics.rs
  - control-plane/src/metrics.ts
  - control-plane/src/index.ts
  - dashboard/src/__tests__/helpers/next-mocks.ts
  - monitoring/prometheus/prometheus.yml
key_decisions:
  - "D073: Hand-rolled Prometheus text format for evidence-collector (counters only, no prometheus crate)"
  - "D074: Merkle proof generated from persisted MerkleAnchor.chain_hashes, not mutable builder"
  - "D075: mpsc::unbounded_channel for test notification (watch coalesces signals, breaks concurrent test)"
  - "D076: prom-client with dedicated Registry, no collectDefaultMetrics (Bun lacks monitorEventLoopDelay)"
  - "D077: Elysia context path in onAfterResponse (request.url can be empty in lifecycle phases)"
patterns_established:
  - "Hand-rolled Prometheus text exposition for simple counter endpoints (no crate dependency)"
  - "Optional<Arc<Metrics>> on service structs for zero-cost opt-in observability"
  - "MerkleProofData as serializable proof container decoupling rs_merkle internals from consumers"
  - "#[cfg(test)] mpsc notification channel on async structs for deterministic test synchronization"
  - "Module-level vi.mock with mutable store for vitest mock hoisting compliance"
  - "Dedicated prom-client Registry for Bun-compatible Prometheus metrics"
  - "Fixed-format ASN.1 validation for known DER structures without parser dependencies"
observability_surfaces:
  - "curl localhost:9090/metrics — 6 Prometheus counters: evidence_bundles_received_total, written_total, retried_total, dead_lettered_total, merkle_anchors_written_total, signing_operations_total"
  - "curl localhost:3000/metrics — 3 Prometheus metrics: http_requests_total, http_request_duration_seconds, rate_limit_rejections_total"
  - "evidence_bundles_dead_lettered_total > 0 signals data loss risk"
  - "rate_limit_rejections_total rising signals brute-force attempts"
  - "PEM OID mismatch returns descriptive SigningError"
drill_down_paths:
  - .gsd/milestones/M009/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S06/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S06/tasks/T03-SUMMARY.md
  - .gsd/milestones/M009/slices/S06/tasks/T04-SUMMARY.md
  - .gsd/milestones/M009/slices/S06/tasks/T05-SUMMARY.md
duration: 90m
verification_result: passed
completed_at: 2026-03-16
---

# S06: Proto Safety, Observability & Testing

**Deprecated proto fields reject non-empty content, flaky kernel test is deterministic, Merkle proof generation and roundtrip verification work end-to-end, and Prometheus /metrics endpoints expose pipeline health on both evidence-collector (9090) and control-plane (3000).**

## What Happened

Five tasks, three concerns: safety fixes, test infrastructure, and observability.

**Safety fixes (T01):** Three surgical changes. Proto `prompt_text` and `response_text` fields now have `max_len = 0`, rejecting any non-empty content at the gRPC validation layer. Timestamp nanos casts replaced with `u32::try_from().unwrap_or(0)` (handles negative nanos from malformed proto) and `i32::try_from().expect()` (chrono guarantees range, expect makes assumption explicit). PEM `decode_pem()` now validates Ed25519 PKCS8 ASN.1 OID at bytes 7..12 before extracting the key — rejects unrecognized key types with a descriptive error instead of silently extracting garbage bytes. Three unit tests cover valid PKCS8, wrong OID, and raw-key passthrough.

**Test determinism (T02):** Four kernel queue tests that used `sleep(50ms)` for synchronization now use an `mpsc::unbounded_channel` notification pattern. The `ReviewQueue` gains a `#[cfg(test)]` sender field; `escalate()` signals after insertion; tests `recv().await` for the exact event. Used `mpsc` instead of the planned `watch` channel because `test_escalate_concurrent_limit` needs 2 discrete signals and `watch` coalesces sends. Zero production overhead — field is `Option<Sender>` compiled out in release builds.

**Merkle proofs and roundtrip test (T03):** `MerkleAnchor::proof_for_bundle()` rebuilds a tree from persisted `chain_hashes`, finds the leaf, and returns a `MerkleProofData` struct (proof bytes, leaf index, total leaves, root). `interdict-verify` gained `verify_bundle_proof()` that deserializes and validates proofs against an expected root. The roundtrip integration test creates 5 bundles with chained hashes, builds the Merkle tree, generates proofs for each, verifies every proof, and confirms root integrity — proving the full collector→verifier pipeline.

**Evidence-collector metrics (T04):** `CollectorMetrics` wraps S01's `Arc<WriterHealth>` (reading existing atomics directly) plus 3 new counters: `bundles_received`, `merkle_anchors_written`, `signing_operations`. `render_prometheus()` produces valid Prometheus text exposition format. `serve_metrics()` is a minimal TCP listener — `GET /metrics` returns 200, everything else 404. Port configurable via `COLLECTOR_METRICS_PORT` (default 9090). Metrics passed to `EvidenceService` as `Option<Arc<CollectorMetrics>>` for zero-cost opt-in.

**Control-plane metrics and cleanup (T05):** Installed `prom-client` with a dedicated Registry (no `collectDefaultMetrics` — crashes Bun). Three metrics: `http_requests_total` Counter, `http_request_duration_seconds` Histogram, `rate_limit_rejections_total` Counter. `/metrics` route wired before authPlugin for unauthenticated Prometheus scraping. Path normalization collapses UUIDs/numeric IDs to `:id` to prevent label cardinality explosion. Prometheus scrape config updated: control-plane targets `/metrics` (was `/health`), evidence-collector targets port 9090 (was 50051). Vitest mock hoisting fixed by moving `vi.mock("next/headers")` to module scope with a mutable store.

## Verification

All slice-level checks pass:

- `buf lint` — clean (max_len=0 constraint accepted)
- `cargo build --workspace` — passes
- `cargo test --workspace --all-targets` — zero failures
- `cargo test -p kernel --test-threads=1` — passes deterministically (3 consecutive runs, zero flakes)
- `cargo test -p evidence-collector` — 97 tests pass (including merkle proofs, roundtrip, metrics)
- `cargo test -p interdict-verify` — 8 tests pass (including verify_bundle_proof)
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- `bun test` (control-plane) — 411 pass, 4 pre-existing failures (exchangeApiKeyForSession unimplemented)
- `npx vitest run` (dashboard) — 55 files, 415 tests, all pass, zero mock hoisting warnings

## Requirements Advanced

- FH-QUALITY-01 — Flaky kernel test replaced with deterministic mpsc notification channel. Zero failures across repeated runs.
- FH-OBSERVABILITY-01 — Both Prometheus /metrics endpoints implemented: evidence-collector:9090 (6 pipeline counters) and control-plane:3000 (HTTP requests, duration histogram, rate limit rejections).
- FH-TESTING-01 — Merkle proof generation and verification implemented. Roundtrip integration test proves full bundle→chain→sign→merkle→verify pipeline.

## Requirements Validated

- FH-QUALITY-01 — All quality items delivered: flaky test fixed (S06/T02), render-phase side effects fixed (S04), SlaTimer shared interval (S04), ARIA accessibility (S04), dead code removed (S03). Verification: `cargo test -p kernel --test-threads=1` passes deterministically, `npx vitest run` passes with zero warnings.
- FH-OBSERVABILITY-01 — Both metrics endpoints respond with valid Prometheus text format. Evidence-collector exposes 6 pipeline health counters. Control-plane exposes HTTP request rates and rate limit stats. Prometheus scrape config targets both. Verification: unit tests prove format validity and HTTP response correctness.
- FH-TESTING-01 — Roundtrip integration test creates bundles, chains them, generates Merkle proofs for each, and verifies all proofs against the tree root. `verify_bundle_proof()` validates individual bundle inclusion. Verification: `cargo test -p evidence-collector -- roundtrip` passes.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T02: Used `mpsc::unbounded_channel` instead of planned `watch` channel — `watch` coalesces signals, causing deadlock in `test_escalate_concurrent_limit` which needs 2 discrete messages.
- T03: Used `#[test]` instead of planned `#[tokio::test]` for roundtrip test — all operations are synchronous.
- T04: Added `Content-Length` header to HTTP responses and made metrics field `Option<Arc<CollectorMetrics>>` — necessary for correct HTTP behavior and test ergonomics.
- T05: Placed test file at `control-plane/src/metrics.test.ts` (co-located) instead of `__tests__/` — matches existing codebase patterns. Used Elysia `path` context property instead of parsing `request.url`.

## Known Limitations

- Rate limiter 429 responses don't yet increment `rate_limit_rejections_total` — the rate limiter hook returns early before reaching app-level lifecycle hooks. Counter is registered and exported, ready for wiring.
- 4 pre-existing bun test failures in `service.test.ts` (`exchangeApiKeyForSession` not implemented) — not introduced by this slice.

## Follow-ups

- Wire rate limiter rejection counting to `rate_limit_rejections_total` counter (requires rate limiter hook to call metrics directly rather than relying on Elysia lifecycle).

## Files Created/Modified

- `proto/interdict/evidence/v1/evidence.proto` — max_len=0 on deprecated fields 10 and 11
- `crates/evidence-collector/src/grpc/service.rs` — safe u32::try_from for timestamp nanos, metrics counter increments
- `crates/kernel/src/evidence/bundle.rs` — safe i32::try_from for subsec nanos
- `crates/evidence-collector/src/signing/local.rs` — ASN.1 OID validation in decode_pem() + 3 unit tests
- `crates/kernel/src/policy/layer3/queue.rs` — #[cfg(test)] mpsc notification channel, 4 tests updated
- `crates/evidence-collector/src/merkle/builder.rs` — MerkleProofData struct, proof_for_bundle() method, 3 tests
- `crates/interdict-verify/src/merkle.rs` — verify_bundle_proof() function, 2 tests
- `crates/evidence-collector/tests/roundtrip_test.rs` — new: full pipeline roundtrip integration test
- `crates/evidence-collector/src/metrics.rs` — new: CollectorMetrics, render_prometheus(), serve_metrics(), 4 tests
- `crates/evidence-collector/src/lib.rs` — added pub mod metrics
- `crates/evidence-collector/src/main.rs` — metrics creation, port config, HTTP listener spawn
- `control-plane/src/metrics.ts` — new: prom-client Registry with 3 metrics, lifecycle hooks
- `control-plane/src/index.ts` — /metrics route, request timing hooks
- `control-plane/src/metrics.test.ts` — new: 4 tests for metrics endpoint
- `control-plane/package.json` — added prom-client@15.1.3
- `dashboard/src/__tests__/helpers/next-mocks.ts` — module-level vi.mock with mutable store
- `monitoring/prometheus/prometheus.yml` — updated scrape targets for both services

## Forward Intelligence

### What the next slice should know
- This is the final slice of M009. All 41 assessment findings are addressed. The milestone definition of done checklist should be fully satisfiable.

### What's fragile
- Control-plane `rate_limit_rejections_total` counter is registered but not wired to rate limiter rejections — it will show 0 in Prometheus scrapes until the hook integration is done.
- Evidence-collector metrics HTTP listener is hand-rolled TCP (no HTTP framework) — adequate for `/metrics` but not extensible to more routes without refactoring.

### Authoritative diagnostics
- `curl localhost:9090/metrics` — evidence-collector pipeline health (6 counters from WriterHealth atomics)
- `curl localhost:3000/metrics` — control-plane request rates and latency distribution
- `cargo test -p evidence-collector -- roundtrip` — proves the full chain+signature+Merkle pipeline in one test

### What assumptions changed
- prom-client Bun compatibility (roadmap risk) — confirmed working with dedicated Registry and no collectDefaultMetrics. The crash is specifically in `monitorEventLoopDelay`, not the library broadly.
- buf.validate max_len=0 (roadmap risk) — confirmed working. buf lint accepts the constraint and generates correct CEL validation rejecting any non-empty content.
