# T01: Expand rate limiter IP fallback and add apiRateLimiter to write endpoints

## Description

Create a shared `apiRateLimiter` instance (60/min, env-configurable) and wire it to 4 write/expensive endpoints. Upgrade `createRateLimitHook` IP resolution to fall through `x-forwarded-for` → `x-real-ip` → `server.requestIP(request)` → `"unknown"`. This is the core deliverable of S03 — closes FH-SECURITY-02.

## Slice Context

**Goal:** Rate limiting covers write endpoints and expensive operations (60/min shared budget alongside existing 10/min auth rate limit). IP resolution has robust fallback chain.

**Verification:** `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts` passes with all existing + new tests. `cd control-plane && bun test` full suite passes.

## Steps

1. **Update `createRateLimitHook` IP resolution in `control-plane/src/modules/auth/rate-limiter.ts`:**
   - The function is at line ~164. Currently accepts `{ request, set }` and resolves IP from `x-forwarded-for` only, falling back to `"unknown"`.
   - Expand the context type to also accept an optional `server` field: `server?: { requestIP: (req: Request) => { address: string } | null }`. This is Bun's `Server` API for getting socket remote address.
   - Change the IP resolution chain inside the hook to:
     ```
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
     ```
   - Keep everything else in the function unchanged — the fail-open catch, the 429 response body, the Retry-After header.

2. **Create `apiRateLimiter` in `control-plane/src/modules/auth/index.ts`:**
   - This file already creates `authRateLimiter` (10/min). Follow the same pattern.
   - Add env-configurable API rate limiter:
     ```typescript
     export const apiRateLimiter = new RateLimiter({
       maxRequests: Number(process.env.API_RATE_LIMIT_MAX) || 60,
       windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60_000,
     });
     ```
   - Export it alongside the existing `authRateLimiter`.

3. **Wire `apiRateLimiter` to 4 write endpoints:**
   - **`control-plane/src/modules/policies/index.ts`** — `POST /` (create policy, line ~40). Import `apiRateLimiter` and `createRateLimitHook` from the auth module. Add `{ beforeHandle: createRateLimitHook(apiRateLimiter) }` as the options argument to `.post("/", handler, OPTIONS)`. Follow the exact pattern from D047 — Elysia 1.4 requires per-route `beforeHandle`, not plugin-level `onBeforeHandle`.
   - **`control-plane/src/modules/reports/index.ts`** — `POST /generate` (line ~35). Same pattern.
   - **`control-plane/src/modules/signing-keys/index.ts`** — `POST /rotate` (line ~42). Same pattern.
   - **`control-plane/src/modules/vendors/index.ts`** — `POST /` (create vendor, line ~42). Same pattern.
   - Check each module's existing imports to determine the right relative path for `../auth` or `../../auth` etc.

4. **Add tests in `control-plane/src/modules/auth/rate-limiter.test.ts`:**
   - This file has 14 existing tests. Add a new `describe` block for IP resolution fallback and one for API rate limiter threshold.
   - Tests to add:
     - **"uses x-forwarded-for when present"** — request with both `x-forwarded-for` and `x-real-ip` headers → hook uses x-forwarded-for value
     - **"falls back to x-real-ip when x-forwarded-for absent"** — request with only `x-real-ip` header → hook uses x-real-ip value. Verify by sending enough requests to trigger rate limit and checking the IP was tracked correctly.
     - **"falls back to server.requestIP when headers absent"** — pass a mock `server` object with `requestIP` returning `{ address: "10.0.0.1" }` → hook uses that address
     - **"falls back to unknown when all sources absent"** — no headers, no server → IP is "unknown"
     - **"API rate limiter returns 429 after 60 requests"** — create a `RateLimiter` with `maxRequests: 60`, call hook 60 times → all pass, 61st → 429
   - Match the existing test style in the file (check how they construct mock `request` and `set` objects).

## Must-Haves

- IP resolution chain: `x-forwarded-for` → `x-real-ip` → `server.requestIP()` → `"unknown"`
- `apiRateLimiter` is a SINGLE shared instance exported from `auth/index.ts` (not per-module — D047 note in research)
- env vars `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` configure the API limiter
- Per-route `beforeHandle` on all 4 target POST endpoints (not plugin-level `onBeforeHandle`)
- 14 existing rate limiter tests continue passing
- 5+ new tests for IP fallback and API threshold

## Verification

```bash
cd control-plane && bun test src/modules/auth/rate-limiter.test.ts
```

All existing + new tests pass.

## Observability Impact

- **429 response body** includes `{ code: "RATE_LIMITED", message: "Too many requests. Please try again later." }` and `Retry-After` header — inspectable by any HTTP client or test
- **`console.warn` on fail-open** with `[rate-limiter]` prefix — future agent can grep logs for `[rate-limiter]` to see both rate-limit-exceeded and internal-error events
- **IP hashing** — `hashIP()` in rate-limiter.ts ensures raw IPs never appear in logs; diagnostics show first 12 chars of SHA-256 hash
- **`getStats()`** — `RateLimiter.getStats()` returns `{ trackedIPs, evictionCount }` for runtime inspection without exposing IP data

## Inputs

- Existing `RateLimiter` class and `createRateLimitHook()` in `control-plane/src/modules/auth/rate-limiter.ts`
- Existing `authRateLimiter` creation pattern in `control-plane/src/modules/auth/index.ts`
- Existing test patterns in `control-plane/src/modules/auth/rate-limiter.test.ts`
- D047 decision: per-route `beforeHandle` is the required pattern for Elysia 1.4

## Expected Output

- Updated `createRateLimitHook` with full IP fallback chain
- `apiRateLimiter` exported from `auth/index.ts`
- 4 endpoint modules import and use `createRateLimitHook(apiRateLimiter)` on their POST routes
- 5+ new passing tests in `rate-limiter.test.ts`
- All 14 existing tests still pass
