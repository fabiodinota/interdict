---
id: T01
parent: S03
milestone: M009
provides:
  - apiRateLimiter shared instance (60/min, env-configurable) exported from auth/index.ts
  - IP resolution fallback chain in createRateLimitHook (x-forwarded-for → x-real-ip → server.requestIP → unknown)
  - Per-route beforeHandle rate limiting on 4 write endpoints
key_files:
  - control-plane/src/modules/auth/rate-limiter.ts
  - control-plane/src/modules/auth/index.ts
  - control-plane/src/modules/auth/rate-limiter.test.ts
  - control-plane/src/modules/policies/index.ts
  - control-plane/src/modules/reports/index.ts
  - control-plane/src/modules/signing-keys/index.ts
  - control-plane/src/modules/vendors/index.ts
key_decisions:
  - Hook signature accepts optional `server` field typed as `{ requestIP: (req: Request) => { address: string } | null }` for Bun Server API compatibility
  - apiRateLimiter uses `cleanupIntervalMs: 60_000` matching authRateLimiter pattern (not disabled)
patterns_established:
  - Per-route `beforeHandle: createRateLimitHook(apiRateLimiter)` on write POST endpoints (D047 pattern)
  - IP resolution: x-forwarded-for → x-real-ip → server.requestIP(request) → "unknown"
observability_surfaces:
  - 429 response body: `{ success: false, error: { code: "RATE_LIMITED", message: "Too many requests..." } }` + `Retry-After` header
  - console.warn on rate limit exceeded with `[rate-limiter]` prefix and hashed IP
  - console.warn on internal error with `[rate-limiter]` prefix (fail-open)
  - RateLimiter.getStats() returns { trackedIPs, evictionCount } for runtime inspection
duration: 25m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Expand rate limiter IP fallback and add apiRateLimiter to write endpoints

**Added 4-step IP resolution fallback chain to rate limiter hook and wired shared 60/min apiRateLimiter to 4 write POST endpoints (policies, reports, signing-keys, vendors).**

## What Happened

Updated `createRateLimitHook` in `rate-limiter.ts` to accept an optional `server` parameter (Bun's Server API) and resolve IPs through a 4-step chain: `x-forwarded-for` → `x-real-ip` → `server.requestIP(request)` → `"unknown"`. The hook signature is backward-compatible — existing callers don't pass `server` and continue working.

Created `apiRateLimiter` in `auth/index.ts` as a second `RateLimiter` instance (60 req/min default, configurable via `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` env vars). Follows the same pattern as the existing `authRateLimiter` (10/min).

Wired `apiRateLimiter` via per-route `beforeHandle` (D047 pattern) to 4 POST endpoints:
- `POST /api/v1/policies` (create policy)
- `POST /api/v1/reports/generate` (generate report)
- `POST /api/v1/admin/signing-keys/rotate` (key rotation)
- `POST /api/v1/vendors` (create vendor)

Added 5 new tests covering all IP fallback branches and the 60-request threshold.

## Verification

- `bun test src/modules/auth/rate-limiter.test.ts` — **17/17 pass** (12 existing + 5 new), 168 expect() calls
- `bun test` full suite — **404/408 pass**. 4 failures are pre-existing and unrelated:
  - 2 × `exchangeApiKeyForSession` tests fail because method not yet implemented on auth service
  - 2 × unhandled errors from missing `DATABASE_URL` env and missing proto files in worktree (environment issues)

### Slice verification progress (T01 of 3):
- ✅ `bun test src/modules/auth/rate-limiter.test.ts` — all existing + new tests pass
- ⬜ `bun test src/modules/auth/saml/handlers.test.ts` — passes (20 pass), not touched by T01
- ⬜ `bun test` full suite — 4 pre-existing failures unrelated to S03
- ⬜ `rg "rolePermissions"` — T03
- ⬜ `rg "_SESSION_MAX_AGE_SECONDS"` — T02
- ⬜ Migration SQL — T03
- ✅ 429 response body includes `{ code: "RATE_LIMITED" }` and `Retry-After` header (verified via test assertions)
- ✅ Fail-open behavior verified (existing test)

## Diagnostics

- Grep logs for `[rate-limiter]` to see rate-limit-exceeded and internal-error events
- 429 responses include structured `{ code: "RATE_LIMITED" }` body and `Retry-After` header (seconds)
- `RateLimiter.getStats()` on either `authRateLimiter` or `apiRateLimiter` returns `{ trackedIPs, evictionCount }` for runtime inspection
- IP hashing via SHA-256 ensures raw IPs never appear in logs

## Deviations

None.

## Known Issues

- Pre-existing: `exchangeApiKeyForSession` tests fail (method not yet on auth service)
- Pre-existing: `auth/index.test.ts` errors on missing `DATABASE_URL` in worktree
- Pre-existing: `distribution/server.test.ts` errors on missing proto files in worktree

## Files Created/Modified

- `control-plane/src/modules/auth/rate-limiter.ts` — expanded `createRateLimitHook` IP resolution chain (x-forwarded-for → x-real-ip → server.requestIP → unknown)
- `control-plane/src/modules/auth/index.ts` — added `apiRateLimiter` (60/min, env-configurable) export
- `control-plane/src/modules/auth/rate-limiter.test.ts` — added 5 tests: IP fallback x4, API threshold x1
- `control-plane/src/modules/policies/index.ts` — added `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /
- `control-plane/src/modules/reports/index.ts` — added `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /generate
- `control-plane/src/modules/signing-keys/index.ts` — added `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /rotate
- `control-plane/src/modules/vendors/index.ts` — added `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /
