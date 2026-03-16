/**
 * Prometheus Metrics Endpoint Tests
 *
 * Verifies that /metrics returns valid Prometheus exposition format,
 * includes expected metric names, increments counters after requests,
 * and that prom-client loads without crashing on Bun (no collectDefaultMetrics).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { Counter, Histogram, Registry } from "prom-client";

// Build a lightweight test app that mirrors production wiring
function createTestApp() {
  const registry = new Registry();

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "path", "status"] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path"] as const,
    registers: [registry],
  });

  const _rateLimitRejectionsTotal = new Counter({
    name: "rate_limit_rejections_total",
    help: "Total rate limit rejections",
    labelNames: ["path"] as const,
    registers: [registry],
  });

  const app = new Elysia()
    .onBeforeHandle(({ store }: { store: Record<string, unknown> }) => {
      store.requestStart = performance.now();
    })
    .onAfterResponse(
      ({
        request,
        store,
        set,
        path,
      }: {
        request: Request;
        store: Record<string, unknown>;
        set: { status?: number | string };
        path: string;
      }) => {
        const method = request.method;
        const status = String(set.status ?? 200);

        httpRequestsTotal.inc({ method, path, status });

        if (typeof store.requestStart === "number") {
          const durationSec = (performance.now() - (store.requestStart as number)) / 1000;
          httpRequestDuration.observe({ method, path }, durationSec);
        }
      },
    )
    .get("/health", () => ({ status: "ok" }))
    .get("/metrics", async () => {
      const body = await registry.metrics();
      return new Response(body, {
        headers: { "content-type": registry.contentType },
      });
    })
    .listen(0);

  return { app, registry };
}

describe("Prometheus /metrics endpoint", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let baseUrl: string;

  beforeAll(() => {
    const setup = createTestApp();
    app = setup.app;
    baseUrl = `http://localhost:${app.server?.port}`;
  });

  afterAll(() => {
    app.stop();
  });

  test("GET /metrics returns 200 with prometheus content type", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/plain");
  });

  test("metrics response includes http_requests_total", async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();
    expect(body).toContain("# TYPE http_requests_total counter");
  });

  test("request counter increments after requests", async () => {
    // Make a request to /health first
    await fetch(`${baseUrl}/health`);
    // Small delay to let onAfterResponse fire
    await new Promise((r) => setTimeout(r, 50));

    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();

    // There should be at least one http_requests_total line with path="/health"
    const healthLine = body
      .split("\n")
      .find((l) => l.startsWith("http_requests_total") && l.includes("/health"));
    expect(healthLine).toBeDefined();
    // Value should be > 0
    const value = Number(healthLine?.split(" ").pop());
    expect(value).toBeGreaterThan(0);
  });

  test("no collectDefaultMetrics crash — prom-client imports cleanly on Bun", async () => {
    // This test proves that our metrics module loads without calling
    // collectDefaultMetrics(), which would crash Bun due to missing
    // monitorEventLoopDelay. If we get here, the import succeeded.
    const mod = await import("./metrics");
    expect(mod.metricsRegistry).toBeDefined();
    expect(mod.httpRequestsTotal).toBeDefined();
    expect(mod.httpRequestDuration).toBeDefined();
    expect(mod.rateLimitRejectionsTotal).toBeDefined();
  });
});
