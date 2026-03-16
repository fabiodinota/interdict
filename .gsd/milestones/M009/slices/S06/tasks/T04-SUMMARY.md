---
id: T04
parent: S06
milestone: M009
provides:
  - "CollectorMetrics struct exposing 6 pipeline health counters via Prometheus /metrics endpoint"
  - "HTTP listener on configurable port (COLLECTOR_METRICS_PORT, default 9090) with GET /metrics → 200, else 404"
  - "bundles_received counter incremented in process_bundle() on each gRPC bundle arrival"
  - "signing_operations counter incremented after each successful signing call"
key_files:
  - crates/evidence-collector/src/metrics.rs
  - crates/evidence-collector/src/main.rs
  - crates/evidence-collector/src/grpc/service.rs
  - crates/evidence-collector/src/lib.rs
key_decisions:
  - "metrics field on EvidenceCollectorGrpcService is Option<Arc<CollectorMetrics>> — keeps the field optional so existing tests and integration paths that don't need metrics don't have to construct one"
  - "bundles_received incremented after kernel_id validation but before dedup check — counts all non-malformed submissions for accurate ingest rate tracking"
  - "Content-Length header added to HTTP responses for correct HTTP/1.1 compliance (not in original plan but necessary for reliable client reads)"
patterns_established:
  - "Hand-rolled Prometheus text exposition format for simple counter-only endpoints (no prometheus crate dependency, per D073)"
  - "Optional<Arc<Metrics>> pattern on service structs for zero-cost opt-in observability"
observability_surfaces:
  - "curl localhost:9090/metrics returns 6 Prometheus counters: evidence_bundles_received_total, evidence_bundles_written_total, evidence_bundles_retried_total, evidence_bundles_dead_lettered_total, evidence_merkle_anchors_written_total, evidence_signing_operations_total"
  - "evidence_bundles_dead_lettered_total > 0 signals data loss risk"
  - "evidence_bundles_retried_total rising signals ClickHouse instability"
duration: 20m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T04: Evidence-collector Prometheus /metrics endpoint

**Added HTTP /metrics endpoint on port 9090 exposing 6 pipeline health counters in Prometheus text exposition format, reading WriterHealth atomics directly as single source of truth**

## What Happened

Created `metrics.rs` with `CollectorMetrics` struct wrapping `Arc<WriterHealth>` (from S01's ClickHouseWriter) plus three new AtomicU64 counters: `bundles_received`, `merkle_anchors_written`, `signing_operations`. The `render_prometheus()` method produces valid Prometheus text exposition format with `# HELP`, `# TYPE`, and value lines for all 6 counters.

`serve_metrics()` is a minimal async TCP listener using `tokio::net::TcpListener` — no HTTP framework. Responds to `GET /metrics` with 200 + text/plain body, 404 for all other paths. Connection errors are logged and don't crash the server.

In `main.rs`, the metrics are initialized after `ClickHouseWriter` creation (reading its `health()` Arc directly), port is configurable via `COLLECTOR_METRICS_PORT` (default 9090), and the HTTP server is spawned alongside the gRPC server.

`EvidenceCollectorGrpcService` gained an `Option<Arc<CollectorMetrics>>` field. `process_bundle()` increments `bundles_received` at the start and `signing_operations` after successful signing.

## Verification

- `cargo test -p evidence-collector -- metrics` — 4/4 tests pass (render format, empty render, HTTP 200, HTTP 404)
- `cargo test -p evidence-collector` — 97 tests pass (89 unit + 7 integration + 1 roundtrip), zero failures
- `cargo build --workspace` — compiles clean
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean
- `cargo test --workspace --all-targets` — all workspace tests pass

### Slice-level verification (T04 is intermediate, not final):
- ✅ `cargo build --workspace` — passes
- ✅ `cargo test -p evidence-collector` — all existing + new tests pass
- ✅ `cargo test --workspace --all-targets` — zero failures
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — clean
- ✅ `cargo fmt --all -- --check` — clean
- ⏳ `bun test` (control-plane/) — T05
- ⏳ `npx vitest run` (dashboard/) — T05
- ⏳ `buf lint` — already verified in T01

## Diagnostics

- `curl localhost:9090/metrics` returns text/plain with all 6 counter values
- `evidence_bundles_dead_lettered_total > 0` signals data loss risk
- `evidence_bundles_retried_total` rising signals ClickHouse instability
- Counter values are monotonic; scrape at any frequency for rate computation

## Deviations

- Added `Content-Length` header to HTTP responses — not in plan but required for reliable HTTP/1.1 client behavior (without it, `TcpStream::read_to_end` blocks until connection close, which only happens when the spawned task completes)
- `metrics` field on `EvidenceCollectorGrpcService` is `Option<Arc<CollectorMetrics>>` rather than `Arc<CollectorMetrics>` — avoids forcing all test construction sites to provide metrics

## Known Issues

None

## Files Created/Modified

- `crates/evidence-collector/src/metrics.rs` — new module: CollectorMetrics struct, render_prometheus(), serve_metrics(), 4 unit tests
- `crates/evidence-collector/src/lib.rs` — added `pub mod metrics;`
- `crates/evidence-collector/src/main.rs` — metrics creation, COLLECTOR_METRICS_PORT config, tokio::spawn for HTTP listener, metrics passed to service constructor
- `crates/evidence-collector/src/grpc/service.rs` — added metrics field (Option<Arc<CollectorMetrics>>), updated constructor, added bundles_received + signing_operations increments in process_bundle()
