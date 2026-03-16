/**
 * In-Memory Rate Limiter
 *
 * Per-IP sliding window rate limiter for auth endpoints.
 * Uses a Map with TTL-based eviction to prevent unbounded memory growth.
 *
 * Addresses H-02: No rate limiting on auth endpoints enables brute-force
 * API key enumeration.
 *
 * Redaction: never logs raw IP addresses — uses hashed/truncated IPs for diagnostics.
 * Fail-open: on internal error, requests are allowed through with a warning logged.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimiterConfig {
  /** Maximum requests allowed within the window (default: 10) */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs: number;
  /** How often to run cleanup of expired entries in ms (default: 60_000) */
  cleanupIntervalMs: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiterStats {
  trackedIPs: number;
  evictionCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash an IP for safe logging (never log raw IPs). */
function hashIP(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// RateLimiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private readonly config: RateLimiterConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private _evictionCount = 0;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      maxRequests: config?.maxRequests ?? 10,
      windowMs: config?.windowMs ?? 60_000,
      cleanupIntervalMs: config?.cleanupIntervalMs ?? 60_000,
    };

    // Start periodic cleanup
    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(
        () => this.evictExpired(),
        this.config.cleanupIntervalMs,
      );
      // Don't block process exit
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Check whether a request from `ip` is allowed.
   *
   * Returns `{ allowed: true, retryAfterMs: 0 }` if under threshold,
   * or `{ allowed: false, retryAfterMs: N }` if the IP has exceeded
   * the rate limit.
   */
  check(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = this.entries.get(ip);

    // No existing entry or window has expired → start a new window
    if (!entry || entry.resetAt <= now) {
      this.entries.set(ip, { count: 1, resetAt: now + this.config.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    // Within the current window
    entry.count += 1;

    if (entry.count > this.config.maxRequests) {
      const retryAfterMs = Math.max(0, entry.resetAt - now);
      console.warn(
        `[rate-limiter] Rate limit exceeded for IP ${hashIP(ip)} — ` +
        `${entry.count}/${this.config.maxRequests} in window, ` +
        `retry after ${retryAfterMs}ms`,
      );
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  /** Remove entries whose window has expired. */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [ip, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(ip);
        evicted++;
      }
    }
    this._evictionCount += evicted;
    return evicted;
  }

  /** Debug/diagnostic stats — never expose raw IPs. */
  getStats(): RateLimiterStats {
    return {
      trackedIPs: this.entries.size,
      evictionCount: this._evictionCount,
    };
  }

  /** Stop the cleanup timer and clear all entries. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Elysia Route Hook Helper
// ---------------------------------------------------------------------------

/**
 * Create a per-route `beforeHandle` function that applies rate limiting.
 *
 * Usage in Elysia route options:
 *   .post("/path", handler, { beforeHandle: createRateLimitHook(limiter) })
 *
 * IP is resolved from `x-forwarded-for` header (first entry) falling back
 * to "unknown".
 *
 * On internal error the limiter fails-open (allows the request) and logs
 * a warning — never blocks legitimate traffic due to limiter bugs.
 */
export function createRateLimitHook(limiter: RateLimiter) {
  return ({ request, set, server }: {
    request: Request;
    set: { status: number; headers: Record<string, string> };
    server?: { requestIP: (req: Request) => { address: string } | null };
  }) => {
    try {
      const forwarded = request.headers.get("x-forwarded-for");
      const realIp = request.headers.get("x-real-ip");
      let ip: string;
      if (forwarded) {
        ip = forwarded.split(",")[0].trim();
      } else if (realIp) {
        ip = realIp.trim();
      } else if (server) {
        const addr = server.requestIP(request);
        ip = addr?.address ?? "unknown";
      } else {
        ip = "unknown";
      }

      const result = limiter.check(ip);

      if (!result.allowed) {
        set.status = 429;
        const retryAfterSec = String(Math.ceil(result.retryAfterMs / 1000));
        set.headers["Retry-After"] = retryAfterSec;
        return {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
          },
        };
      }
    } catch (err) {
      // Fail-open: allow request through on internal error
      console.warn(
        `[rate-limiter] Internal error, failing open: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
