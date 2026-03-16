/**
 * Prometheus Metrics for Interdict Control Plane
 *
 * Custom metrics only — collectDefaultMetrics() is NOT called because
 * Bun lacks monitorEventLoopDelay, which crashes Node's default metrics.
 * See D073 (evidence-collector) for precedent; this follows the same
 * dedicated-registry pattern.
 *
 * Metrics exposed:
 *   http_requests_total          — Counter {method, path, status}
 *   http_request_duration_seconds — Histogram {method, path}
 *   rate_limit_rejections_total  — Counter {path}
 */

import { Registry, Counter, Histogram } from "prom-client";

// Dedicated registry — avoids polluting the global default
export const metricsRegistry = new Registry();

// ---------------------------------------------------------------------------
// Metric definitions
// ---------------------------------------------------------------------------

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path"] as const,
  registers: [metricsRegistry],
});

export const rateLimitRejectionsTotal = new Counter({
  name: "rate_limit_rejections_total",
  help: "Total rate limit rejections",
  labelNames: ["path"] as const,
  registers: [metricsRegistry],
});

// ---------------------------------------------------------------------------
// Elysia lifecycle helpers
// ---------------------------------------------------------------------------

/** Normalize path to collapse IDs into :id placeholders for label cardinality. */
function normalizePath(path: string): string {
  // Replace UUID-like segments and numeric IDs with :id
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

/**
 * Store interface for passing request start time through Elysia context.
 * Extend the app's store type with this.
 */
export interface MetricsStore {
  requestStart?: number;
}

/**
 * onBeforeHandle hook — records request start time.
 */
export function metricsOnBeforeHandle({ store }: { store: MetricsStore }) {
  store.requestStart = performance.now();
}

/**
 * onAfterResponse hook — records request count and duration.
 *
 * Uses onAfterResponse (not onAfterHandle) because Elysia's onAfterHandle
 * runs before the status code is finalized for error responses.
 * Uses `path` from Elysia context directly — `request.url` may be empty
 * in some Elysia lifecycle phases.
 */
export function metricsOnAfterResponse({
  request,
  store,
  set,
  path,
}: {
  request: Request;
  store: MetricsStore;
  set: { status?: number | string };
  path: string;
}) {
  const method = request.method;
  const normalizedPath = normalizePath(path);
  const status = String(set.status ?? 200);

  httpRequestsTotal.inc({ method, path: normalizedPath, status });

  if (store.requestStart !== undefined) {
    const durationSec = (performance.now() - store.requestStart) / 1000;
    httpRequestDuration.observe({ method, path: normalizedPath }, durationSec);
  }
}
