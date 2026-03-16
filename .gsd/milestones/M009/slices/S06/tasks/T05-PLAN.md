---
estimated_steps: 5
estimated_files: 6
---

# T05: Control-plane Prometheus, vitest mock fix, scrape config update

**Slice:** S06 — Proto Safety, Observability & Testing
**Milestone:** M009

## Description

Complete FH-OBSERVABILITY-01 by adding Prometheus metrics to the control-plane Elysia app, fix the vitest mock hoisting warning in dashboard tests, and update the Prometheus scrape config to target real `/metrics` endpoints on both services.

## Steps

1. **Install prom-client in control-plane:** Run `cd control-plane && bun add prom-client`. This is the de facto Prometheus client for Node.js/Bun. **Do NOT call `collectDefaultMetrics()`** — it crashes Bun because `monitorEventLoopDelay` is undefined in Bun's runtime. Custom metrics only.

2. **Create `control-plane/src/metrics.ts`:**
   - Import `Registry, Counter, Histogram` from `prom-client`
   - Create a dedicated `Registry` instance (don't use the global default — avoid conflicts):
     ```typescript
     export const metricsRegistry = new Registry();
     ```
   - Register custom metrics:
     - `http_requests_total` — Counter with labels `method`, `path`, `status`
     - `http_request_duration_seconds` — Histogram with labels `method`, `path` (default buckets are fine)
     - `rate_limit_rejections_total` — Counter (no labels needed, or with `path` label)
   - Export a helper for request lifecycle hooks that can be wired into Elysia:
     - `onBeforeHandle`: store request start time on the request context (e.g., `store.requestStart = performance.now()`)
     - `onAfterHandle`: compute duration, increment `http_requests_total` with method/path/status labels, observe duration on histogram
   - Export the individual metric instances so other modules can increment them (e.g., `rateLimitRejectionsCounter.inc()` from rate limiter, if it exists)

3. **Wire metrics into `control-plane/src/index.ts`:**
   - Import `metricsRegistry` and hook functions from `./metrics`
   - Add a `/metrics` GET route **before** the auth plugin (metrics endpoint should be unauthenticated for Prometheus scraping):
     ```typescript
     .get("/metrics", async () => {
       const body = await metricsRegistry.metrics();
       return new Response(body, {
         headers: { "content-type": metricsRegistry.contentType },
       });
     })
     ```
   - Wire the `onBeforeHandle` and `onAfterHandle` hooks at the app level for request counting. Check Elysia hook API — may need `.onBeforeHandle(fn)` and `.onAfterHandle(fn)` or equivalent lifecycle hooks. If Elysia lifecycle hooks don't have access to response status in `onAfterHandle`, count requests in `onAfterResponse` instead.
   - If the rate limiter from S03 exists and has a rejection counter, wire `rateLimitRejectionsCounter.inc()` on 429 responses.

4. **Write `control-plane/src/__tests__/metrics.test.ts`:**
   - Import the app or create a test instance
   - `test("GET /metrics returns 200 with prometheus content type")`: fetch `/metrics`, assert status 200, assert content-type includes `text/plain` or `text/plain; version=0.0.4`
   - `test("metrics response includes http_requests_total")`: fetch `/metrics`, assert body contains `# TYPE http_requests_total counter`
   - `test("request counter increments after requests")`: fetch `/health`, then fetch `/metrics`, verify `http_requests_total` value > 0
   - `test("no collectDefaultMetrics crash")`: verify the metrics module can be imported without error (proves Bun compatibility — milestone proof-strategy risk retirement)
   - Use `bun test` patterns matching existing test files in `control-plane/src/__tests__/`

5. **Fix vitest mock hoisting + update Prometheus scrape config:**
   - In `dashboard/src/__tests__/helpers/next-mocks.ts`:
     - Move `vi.mock("next/headers", ...)` from inside `mockNextHeadersCookies()` (currently around line 80) to **module-level scope** (top of file, after imports)
     - The mock factory should reference a module-level mutable store (e.g., `let mockCookieStore = new Map<string, string>()`) that `mockNextHeadersCookies()` configures
     - `mockNextHeadersCookies()` becomes a configuration function that sets up the store's return values, not a mock registration function
     - Verify no test expects the real `next/headers` module (none do — all API route tests already mock it)
   - In `monitoring/prometheus/prometheus.yml`:
     - Change control-plane job: `metrics_path: /metrics` (was `/health`), target stays `control-plane:3000`
     - Change evidence-collector job: target to `evidence-collector:9090`, `metrics_path: /metrics` (was `/probe` on port 50051)
     - Both jobs should use standard Prometheus scrape (no special relabeling needed)
   - Verify: `cd control-plane && bun test`, `npx vitest run` (in dashboard/), validate `prometheus.yml` is valid YAML

## Must-Haves

- [ ] `prom-client` installed in control-plane
- [ ] NO `collectDefaultMetrics()` call (Bun crash prevention)
- [ ] `/metrics` route on control-plane returns valid Prometheus exposition format
- [ ] `http_requests_total`, `http_request_duration_seconds`, `rate_limit_rejections_total` registered
- [ ] `/metrics` endpoint is unauthenticated (before auth plugin)
- [ ] `vi.mock("next/headers")` at module-level in next-mocks.ts (not inside function)
- [ ] `prometheus.yml` targets real /metrics endpoints on both services
- [ ] `bun test` passes with metrics tests
- [ ] `npx vitest run` passes with zero mock hoisting warnings

## Verification

- `cd control-plane && bun test` — passes including metrics tests
- `npx vitest run` (in dashboard/) — passes, no hoisting warning
- `prometheus.yml` — valid YAML with correct targets
- `buf lint` — still clean (no proto changes but confirm)

## Observability Impact

- Signals added/changed: 3 Prometheus metrics on control-plane `/metrics` (HTTP request counter+histogram, rate limit rejection counter)
- How a future agent inspects this: `curl localhost:3000/metrics` returns Prometheus-format metrics
- Failure state exposed: `rate_limit_rejections_total` rising signals brute-force attempts or misconfigured rate limits; `http_request_duration_seconds` histogram shows latency distribution

## Inputs

- `control-plane/src/index.ts` — Elysia app with `.get("/health", ...)` route and `.use(authPlugin)` chain. S03 added rate limiter.
- `control-plane/package.json` — current dependencies (prom-client not yet installed)
- `dashboard/src/__tests__/helpers/next-mocks.ts` — `vi.mock("next/headers", ...)` inside `mockNextHeadersCookies()` at line 80
- `monitoring/prometheus/prometheus.yml` — current scrape config with `/health` and `/probe` paths
- Existing control-plane test patterns in `control-plane/src/__tests__/` for test file structure

## Expected Output

- `control-plane/package.json` — `prom-client` in dependencies
- `control-plane/src/metrics.ts` — new module with Registry, 3 metrics, request lifecycle hooks
- `control-plane/src/index.ts` — `/metrics` route + hooks wired
- `control-plane/src/__tests__/metrics.test.ts` — new test file with 4 tests
- `dashboard/src/__tests__/helpers/next-mocks.ts` — `vi.mock` at module level
- `monitoring/prometheus/prometheus.yml` — updated scrape targets
