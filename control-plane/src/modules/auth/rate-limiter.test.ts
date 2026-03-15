/**
 * Rate Limiter Tests
 *
 * Covers: threshold enforcement, window reset, IP isolation,
 * TTL eviction, 429 response with Retry-After, configurable threshold,
 * fail-open on internal error, getStats() diagnostics.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { RateLimiter, createRateLimitHook } from "./rate-limiter";

// ---------------------------------------------------------------------------
// Unit: RateLimiter class
// ---------------------------------------------------------------------------

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  test("allows requests under the threshold", () => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000, cleanupIntervalMs: 0 });

    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
  });

  test("blocks requests at the threshold", () => {
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000, cleanupIntervalMs: 0 });

    expect(limiter.check("1.1.1.1").allowed).toBe(true);  // 1
    expect(limiter.check("1.1.1.1").allowed).toBe(true);  // 2
    expect(limiter.check("1.1.1.1").allowed).toBe(false); // 3 → blocked
  });

  test("returns retryAfterMs > 0 when blocked", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 30_000, cleanupIntervalMs: 0 });

    limiter.check("1.1.1.1"); // 1 → allowed
    const result = limiter.check("1.1.1.1"); // 2 → blocked

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(30_000);
  });

  test("resets count after window expires", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 50, cleanupIntervalMs: 0 });

    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false);

    // Wait for the window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(limiter.check("1.1.1.1").allowed).toBe(true);
        resolve();
      }, 80);
    });
  });

  test("isolates different IPs", () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000, cleanupIntervalMs: 0 });

    expect(limiter.check("1.1.1.1").allowed).toBe(true);
    expect(limiter.check("1.1.1.1").allowed).toBe(false); // IP A blocked

    // IP B should still be allowed
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
  });

  test("evictExpired removes only expired entries", () => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 50, cleanupIntervalMs: 0 });

    limiter.check("expired-ip"); // will expire quickly

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Add a fresh entry that should NOT be evicted
        limiter.check("fresh-ip");

        const evicted = limiter.evictExpired();
        expect(evicted).toBe(1);

        const stats = limiter.getStats();
        expect(stats.trackedIPs).toBe(1); // only fresh-ip remains
        expect(stats.evictionCount).toBe(1);
        resolve();
      }, 80);
    });
  });

  test("supports configurable threshold", () => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000, cleanupIntervalMs: 0 });

    for (let i = 0; i < 5; i++) {
      expect(limiter.check("1.1.1.1").allowed).toBe(true);
    }
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
  });

  test("getStats returns tracked IPs and eviction count", () => {
    limiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000, cleanupIntervalMs: 0 });

    limiter.check("a");
    limiter.check("b");
    limiter.check("c");

    const stats = limiter.getStats();
    expect(stats.trackedIPs).toBe(3);
    expect(stats.evictionCount).toBe(0);
  });

  test("destroy clears entries and stops timer", () => {
    limiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000, cleanupIntervalMs: 1_000 });

    limiter.check("1.1.1.1");
    expect(limiter.getStats().trackedIPs).toBe(1);

    limiter.destroy();
    expect(limiter.getStats().trackedIPs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Elysia per-route beforeHandle hook
// ---------------------------------------------------------------------------

describe("createRateLimitHook (Elysia per-route beforeHandle)", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  function createApp(lim: RateLimiter) {
    return new Elysia()
      .post("/test", () => ({ success: true }), {
        beforeHandle: createRateLimitHook(lim),
      });
  }

  test("returns 429 with Retry-After header when rate limited", async () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000, cleanupIntervalMs: 0 });
    const app = createApp(limiter);

    // First request allowed
    const r1 = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );
    expect(r1.status).toBe(200);

    // Second request blocked
    const r2 = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );
    expect(r2.status).toBe(429);

    const body = await r2.json();
    expect(body.error.code).toBe("RATE_LIMITED");

    const retryAfter = r2.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  test("uses x-forwarded-for header for IP identification", async () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000, cleanupIntervalMs: 0 });
    const app = createApp(limiter);

    // IP A uses up its quota
    await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );

    // IP B should still be allowed
    const r2 = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.2" },
      }),
    );
    expect(r2.status).toBe(200);
  });

  test("fails open when limiter throws", async () => {
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000, cleanupIntervalMs: 0 });

    // Sabotage the limiter's check method to simulate internal error
    const brokenLimiter = {
      check: () => { throw new Error("out of memory"); },
    } as unknown as RateLimiter;

    const app = new Elysia()
      .post("/test", () => ({ success: true }), {
        beforeHandle: createRateLimitHook(brokenLimiter),
      });

    const r = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );
    // Should NOT return 429 — fail-open
    expect(r.status).toBe(200);
  });
});
