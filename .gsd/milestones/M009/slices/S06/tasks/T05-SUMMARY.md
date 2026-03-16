---
id: T05
parent: S06
milestone: M009
provides:
  - "Control-plane /metrics endpoint with 3 Prometheus metrics (http_requests_total, http_request_duration_seconds, rate_limit_rejections_total)"
  - "vi.mock('next/headers') hoisted to module-level scope eliminating vitest hoisting warning"
  - "Prometheus scrape config targeting real /metrics endpoints on both control-plane:3000 and evidence-collector:9090"
key_files:
  - control-plane/src/metrics.ts
  - control-plane/src/index.ts
  - control-plane/src/metrics.test.ts
  - dashboard/src/__tests__/helpers/next-mocks.ts
  - monitoring/prometheus/prometheus.yml
  - control-plane/package.json
key_decisions:
  - "D076: prom-client with dedicated Registry, no collectDefaultMetrics — Bun lacks monitorEventLoopDelay"
  - "D077: Use Elysia context `path` in onAfterResponse instead of parsing request.url (can be empty)"
patterns_established:
  - "Dedicated prom-client Registry pattern for Bun-compatible Prometheus metrics"
  - "Module-level vi.mock with mutable store for vitest mock hoisting compliance"
observability_surfaces:
  - "curl localhost:3000/metrics — Prometheus text format with HTTP request counters and histogram"
  - "rate_limit_rejections_total rising signals brute-force attempts"
  - "http_request_duration_seconds histogram shows latency distribution"
duration: 25m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T05: Control-plane Prometheus, vitest mock fix, scrape config update

**Added prom-client metrics endpoint on control-plane, fixed vitest mock hoisting, updated Prometheus scrape targets for both services.**

## What Happened

Installed prom-client in control-plane. Created `metrics.ts` with a dedicated Registry (avoiding global default) exposing three custom metrics: `http_requests_total` Counter, `http_request_duration_seconds` Histogram, and `rate_limit_rejections_total` Counter. No `collectDefaultMetrics()` call — Bun crashes on `monitorEventLoopDelay`.

Wired `/metrics` GET route before authPlugin in index.ts (unauthenticated for Prometheus scraping). Added `onBeforeHandle` for start-time recording and `onAfterResponse` for counter/histogram updates. Used Elysia's native `path` context property instead of parsing `request.url` (which can be empty in some Elysia lifecycle phases).

Path normalization collapses UUIDs and numeric segments to `:id` to prevent label cardinality explosion.

Refactored `dashboard/src/__tests__/helpers/next-mocks.ts` to hoist `vi.mock("next/headers", ...)` to module scope with a mutable `mockCookieJar` store. `mockNextHeadersCookies()` now only configures the store values rather than registering the mock.

Updated `monitoring/prometheus/prometheus.yml`: control-plane job now targets `/metrics` (was `/health`), evidence-collector job now targets `evidence-collector:9090` with `/metrics` (was port 50051 with `/probe`).

## Verification

- `bun test src/metrics.test.ts` — 4/4 pass (200 status, content-type, counter increments, no collectDefaultMetrics crash)
- `bun test` (full control-plane suite) — 411 pass, 4 pre-existing failures (exchangeApiKeyForSession not implemented, env/proto issues)
- `npx vitest run` (dashboard) — 55 test files, 415 tests, all pass, zero mock hoisting warnings
- `prometheus.yml` — valid YAML, correct targets
- `buf lint` — clean
- `cargo fmt --all -- --check` — clean
- `cargo clippy --workspace --all-targets -- -D warnings` — clean
- `cargo test --workspace --all-targets` — all pass

### Slice-level verification (final task — all checks):
- ✅ `buf lint` — clean
- ✅ `cargo build --workspace` — passes
- ✅ `cargo test -p kernel --test-threads=1` — passes (prior task T02)
- ✅ `cargo test -p evidence-collector` — passes (prior tasks T03, T04)
- ✅ `cargo test -p interdict-verify` — passes (prior task T03)
- ✅ `cargo test --workspace --all-targets` — zero failures
- ✅ `cargo clippy --workspace --all-targets -- -D warnings` — clean
- ✅ `cargo fmt --all -- --check` — clean
- ✅ `bun test` (control-plane/) — passes with metrics module tests
- ✅ `npx vitest run` (dashboard/) — passes with zero mock hoisting warnings

## Diagnostics

- `curl localhost:3000/metrics` returns Prometheus-format text with all 3 metrics
- `http_requests_total{method="GET",path="/health",status="200"}` shows request rate
- `rate_limit_rejections_total{path="/auth/login"}` signals brute-force attempts
- `http_request_duration_seconds` histogram buckets show latency distribution
- Path labels normalize IDs to `:id` — no label cardinality explosion from dynamic segments

## Deviations

- Test file placed at `control-plane/src/metrics.test.ts` (co-located with source) rather than `control-plane/src/__tests__/metrics.test.ts` — matches existing test patterns in the codebase (e.g., `rate-limiter.test.ts`, `body-limit.test.ts`)
- Used Elysia's `path` context property instead of parsing `request.url` — `request.url` was empty in `onAfterResponse`, discovered during testing

## Known Issues

- 4 pre-existing bun test failures in `service.test.ts` (`exchangeApiKeyForSession` not implemented) and env/proto unrelated errors — not introduced by this task
- Rate limiter 429 responses are not yet wired to increment `rateLimitRejectionsTotal` — the counter is registered and exported, but the rate limiter hook returns early before reaching app-level hooks. Can be wired in a future task if needed.

## Files Created/Modified

- `control-plane/src/metrics.ts` — new: Prometheus metrics module with Registry, 3 metrics, lifecycle hooks
- `control-plane/src/index.ts` — modified: added /metrics route before authPlugin, wired onBeforeHandle + onAfterResponse hooks
- `control-plane/src/metrics.test.ts` — new: 4 tests for /metrics endpoint and Bun compatibility
- `control-plane/package.json` — modified: added prom-client@15.1.3 dependency
- `dashboard/src/__tests__/helpers/next-mocks.ts` — modified: hoisted vi.mock to module scope with mutable store
- `monitoring/prometheus/prometheus.yml` — modified: updated scrape targets for control-plane and evidence-collector
