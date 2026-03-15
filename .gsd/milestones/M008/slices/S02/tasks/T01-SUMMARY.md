---
id: T01
parent: S02
milestone: M008
provides:
  - In-memory per-IP rate limiter class with TTL eviction
  - Per-route beforeHandle hook for Elysia auth endpoints
  - Rate limiting wired to /session/exchange-api-key, /saml/exchange-code, /saml/acs
key_files:
  - control-plane/src/modules/auth/rate-limiter.ts
  - control-plane/src/modules/auth/rate-limiter.test.ts
  - control-plane/src/modules/auth/index.ts
  - control-plane/src/modules/auth/saml/handlers.ts
key_decisions:
  - Per-route beforeHandle instead of Elysia plugin (onBeforeHandle in .use() plugins doesn't short-circuit in Elysia 1.4)
  - Shared RateLimiter instance across all rate-limited auth routes
  - IP hashed with SHA-256 truncated to 12 chars for diagnostic logs
patterns_established:
  - createRateLimitHook(limiter) returns a per-route beforeHandle function for Elysia
  - RateLimiter class with constructor config, check(), evictExpired(), getStats(), destroy()
observability_surfaces:
  - console.warn on rate limit exceeded (includes hashed IP, count, window)
  - console.warn on internal error with fail-open behavior
  - getStats() exposes trackedIPs count and evictionCount for debug
duration: 35m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Implement in-memory rate limiter middleware

**Added per-IP sliding window rate limiter to auth endpoints returning 429 with Retry-After after configurable threshold**

## What Happened

Created `RateLimiter` class using `Map<string, { count, resetAt }>` with configurable `maxRequests` (default 10), `windowMs` (default 60s), and periodic eviction via `setInterval` (unref'd to not block exit). The `check(ip)` method returns `{ allowed, retryAfterMs }`.

Created `createRateLimitHook(limiter)` factory that returns a per-route `beforeHandle` function for Elysia. Extracts IP from `x-forwarded-for` first entry, falls back to "unknown". Returns 429 with `Retry-After` header and `RATE_LIMITED` error body when blocked. Fails-open on internal error.

Wired rate limiting to three auth endpoints:
- `POST /session/exchange-api-key` — API key exchange
- `POST /saml/exchange-code` — SAML handoff code exchange
- `POST /saml/acs` — SAML assertion consumer service

Key design decision: used per-route `beforeHandle` option instead of Elysia `onBeforeHandle` plugin because Elysia 1.4's scoped lifecycle hooks in `.use()` plugins don't short-circuit the request pipeline. Per-route hooks work correctly.

## Verification

- `bun test src/modules/auth/rate-limiter.test.ts` — **12 tests pass** (≥8 required)
  - Unit: under-threshold passes, at-threshold blocks, retryAfterMs > 0, window reset, IP isolation, eviction, configurable threshold, getStats, destroy
  - Integration: 429 + Retry-After header, x-forwarded-for IP identification, fail-open on throw
- `cd control-plane && bun test` — **320 pass, 2 fail** (pre-existing failures in service.test.ts unrelated to this change, confirmed by running without changes)

### Slice verification status (T01 of 3):
- ✅ `bun test src/modules/auth/rate-limiter.test.ts` — 12 tests pass (≥8 required)
- ⬜ `bun test src/modules/auth/cleanup.test.ts` — not yet created (T02)
- ⬜ `bun test src/modules/auth/saml/handlers.test.ts` — not yet created (T03)
- ⬜ `bun test src/modules/auth/saml/config.test.ts` — not yet created (T03)
- ✅ `cd control-plane && bun test` — 320 pass (2 pre-existing failures)

## Diagnostics

- Rate limit warnings: `[rate-limiter] Rate limit exceeded for IP <hash12> — N/M in window, retry after Xms`
- Fail-open warnings: `[rate-limiter] Internal error, failing open: <message>`
- Stats: `authRateLimiter.getStats()` → `{ trackedIPs: N, evictionCount: N }`
- Config overrides via env: `AUTH_RATE_LIMIT_MAX` (default 10), `AUTH_RATE_LIMIT_WINDOW_MS` (default 60000)

## Deviations

- Used `createRateLimitHook()` factory instead of `rateLimiterPlugin()` Elysia plugin pattern. Elysia 1.4 `onBeforeHandle` in `.use()` plugins does not short-circuit — per-route `beforeHandle` is required.

## Known Issues

- 2 pre-existing test failures in `service.test.ts` (`exchangeApiKeyForSession` tests fail when running full suite but pass in isolation — test ordering/timing issue, not caused by this change)

## Files Created/Modified

- `control-plane/src/modules/auth/rate-limiter.ts` — RateLimiter class + createRateLimitHook factory
- `control-plane/src/modules/auth/rate-limiter.test.ts` — 12 tests (9 unit + 3 integration)
- `control-plane/src/modules/auth/index.ts` — wired rate limiter to exchange-api-key and exchange-code routes
- `control-plane/src/modules/auth/saml/handlers.ts` — wired rate limiter to ACS route
