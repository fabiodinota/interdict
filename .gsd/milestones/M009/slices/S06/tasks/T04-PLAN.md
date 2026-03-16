---
estimated_steps: 5
estimated_files: 4
---

# T04: Evidence-collector Prometheus /metrics endpoint

**Slice:** S06 — Proto Safety, Observability & Testing
**Milestone:** M009

## Description

Add a minimal HTTP `/metrics` endpoint on port 9090 to the evidence-collector, exposing pipeline health counters from S01's `WriterHealth` plus additional operational counters. Uses hand-rolled Prometheus text exposition format (no `prometheus` crate dependency — all metrics are simple counters from existing atomics). The metrics port is configurable via `COLLECTOR_METRICS_PORT` env var (default 9090).

## Steps

1. **Create `crates/evidence-collector/src/metrics.rs`:** Define:
   ```rust
   pub struct CollectorMetrics {
       writer_health: Arc<WriterHealth>,
       pub bundles_received: AtomicU64,
       pub merkle_anchors_written: AtomicU64,
       pub signing_operations: AtomicU64,
   }
   ```
   - Constructor takes `Arc<WriterHealth>` from `ClickHouseWriter::health()`
   - Implement `render_prometheus(&self) -> String` that produces valid Prometheus text exposition format:
     ```
     # HELP evidence_bundles_received_total Total evidence bundles received via gRPC
     # TYPE evidence_bundles_received_total counter
     evidence_bundles_received_total <value>
     # HELP evidence_bundles_written_total Total evidence bundles written to ClickHouse
     # TYPE evidence_bundles_written_total counter
     evidence_bundles_written_total <value>
     ```
     ... and so on for `written_total` (from `writer_health.rows_written`), `retried_total` (from `rows_retried`), `dead_lettered_total` (from `rows_dead_lettered`), `merkle_anchors_written_total`, `signing_operations_total`
   - All counters loaded with `Relaxed` ordering (monotonic stats, eventual consistency fine for scraping)

2. **Implement `serve_metrics()` HTTP listener:** In the same `metrics.rs`:
   ```rust
   pub async fn serve_metrics(metrics: Arc<CollectorMetrics>, port: u16) -> Result<()>
   ```
   - Use `tokio::net::TcpListener::bind(("0.0.0.0", port))`
   - Accept connections in a loop, read the HTTP request line, if it's `GET /metrics`, respond with:
     ```
     HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4; charset=utf-8\r\n\r\n{body}
     ```
   - For anything else return `HTTP/1.1 404 Not Found\r\n\r\n`
   - Handle connection errors gracefully (log and continue, don't crash the server)
   - Use `tokio::io::AsyncReadExt` and `AsyncWriteExt` for stream I/O — no HTTP framework needed for this minimal handler

3. **Wire into main.rs:** In `crates/evidence-collector/src/main.rs`:
   - Add `pub mod metrics;` to the crate module structure (in `lib.rs` or `main.rs` depending on current layout)
   - After creating the `ClickHouseWriter` (which provides `Arc<WriterHealth>` via `.health()`), create `Arc<CollectorMetrics>` wrapping it
   - Read `COLLECTOR_METRICS_PORT` from env (default 9090), parse as u16
   - Spawn `tokio::spawn(serve_metrics(metrics.clone(), port))` alongside the gRPC server
   - Pass `Arc<CollectorMetrics>` to `EvidenceService` (add a field) so it can increment `bundles_received` in `process_bundle()`
   - In `EvidenceService::process_bundle()`, add `self.metrics.bundles_received.fetch_add(1, Relaxed)` at the start of bundle processing

4. **Add unit tests** in `metrics.rs`:
   - `test_render_prometheus_format`: create `CollectorMetrics` with known counter values, call `render_prometheus()`, verify output contains `# TYPE evidence_bundles_received_total counter`, verify values are correct, verify output ends with newline
   - `test_render_prometheus_empty`: new metrics with zero values, verify format is still valid (all counters show 0)
   - `test_serve_metrics_returns_200`: spawn `serve_metrics` on a random port, connect with `TcpStream`, send `GET /metrics HTTP/1.1\r\n\r\n`, verify response starts with `HTTP/1.1 200` and body contains counter lines
   - `test_serve_metrics_404_on_unknown_path`: send `GET /unknown`, verify `HTTP/1.1 404`

5. **Verify:** `cargo test -p evidence-collector -- metrics`, `cargo build --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all -- --check`.

## Must-Haves

- [ ] `CollectorMetrics` exposes all 6 counters: bundles_received, written, retried, dead_lettered, merkle_anchors_written, signing_operations
- [ ] `render_prometheus()` produces valid Prometheus text exposition format (# HELP, # TYPE, value lines)
- [ ] HTTP listener on configurable port (default 9090) returns 200 on GET /metrics, 404 otherwise
- [ ] `WriterHealth` atomics from S01 are read (not duplicated) — single source of truth
- [ ] `bundles_received` incremented in `process_bundle()`
- [ ] No `prometheus` crate dependency — hand-rolled text format (D073)
- [ ] Unit tests validate format and HTTP behavior

## Verification

- `cargo test -p evidence-collector -- metrics` — all metrics tests pass
- `cargo build --workspace` — compiles
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo fmt --all -- --check` — clean

## Observability Impact

- Signals added/changed: 6 Prometheus counters on `/metrics` endpoint (pipeline health, operational stats)
- How a future agent inspects this: `curl localhost:9090/metrics` returns text/plain with all counter values
- Failure state exposed: `evidence_bundles_dead_lettered_total > 0` signals data loss risk; `evidence_bundles_retried_total` rising signals ClickHouse instability

## Inputs

- `crates/evidence-collector/src/storage/clickhouse.rs` — `WriterHealth` struct with `rows_written`, `rows_retried`, `rows_dead_lettered` AtomicU64 counters. Accessed via `ClickHouseWriter::health() -> Arc<WriterHealth>`.
- `crates/evidence-collector/src/main.rs` — current structure: creates ClickHouseWriter, creates EvidenceService, starts gRPC server via tonic
- `crates/evidence-collector/src/grpc/service.rs` — `EvidenceService` struct and `process_bundle()` method
- S01 Forward Intelligence: "WriterHealth is accessed via ClickHouseWriter::health() returning Arc<WriterHealth>. Load counters with rows_written.load(Relaxed)."

## Expected Output

- `crates/evidence-collector/src/metrics.rs` — new module with `CollectorMetrics`, `render_prometheus()`, `serve_metrics()`, 4 unit tests
- `crates/evidence-collector/src/main.rs` — metrics creation, port config, tokio::spawn for HTTP listener, metrics passed to EvidenceService
- `crates/evidence-collector/src/grpc/service.rs` — `metrics` field on EvidenceService, `bundles_received` increment in `process_bundle()`
- Module declaration added (in main.rs or lib.rs)
