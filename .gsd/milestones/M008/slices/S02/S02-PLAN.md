# S02: Auth Hardening — Rate Limiting, Session Cleanup, SAML Tests

**Goal:** Add rate limiting to auth endpoints, implement automatic expired session/handoff cleanup, and write comprehensive SAML auth handler tests.
**Demo:** Rate limiter returns 429 after threshold. Cleanup test proves expired row deletion. SAML test suite has ≥20 test cases covering all handler paths. `bun test` passes with all new tests.

## Must-Haves

- In-memory per-IP sliding window rate limiter on auth endpoints (configurable threshold, default 10/min)
- Rate limiter has TTL-based eviction to prevent unbounded memory growth
- Interval-based cleanup deletes expired sessions and handoff codes
- SAML handler tests cover: SSO redirect, ACS processing, handoff code creation/redemption/expiry, JIT user provisioning, SLO, metadata, invalid responses, disabled SAML
- All tests pass in `bun test`

## Proof Level

- This slice proves: contract + integration (rate limiter exercises real Elysia middleware, SAML tests exercise real samlify library via mocks)
- Real runtime required: no (test-driven)
- Human/UAT required: no

## Verification

- `bun test src/modules/auth/rate-limiter.test.ts` — ≥8 tests pass (threshold, window reset, IP isolation, eviction, 429 response)
- `bun test src/modules/auth/cleanup.test.ts` — ≥6 tests pass (session deletion, handoff deletion, preservation of active, batch size)
- `bun test src/modules/auth/saml/handlers.test.ts` — ≥15 tests pass (SSO, ACS, handoff, JIT, SLO, metadata, errors)
- `bun test src/modules/auth/saml/config.test.ts` — ≥5 tests pass (enabled/disabled, missing env vars, cert loading)
- `cd control-plane && bun test` — all 308+ existing tests still pass

## Observability / Diagnostics

- Runtime signals: `console.warn` when rate limit triggered (includes IP hash, not raw IP); `console.info` on cleanup run (count of deleted sessions/handoffs)
- Inspection surfaces: rate limiter exposes `getStats()` for debug logging (total tracked IPs, eviction count)
- Failure visibility: cleanup errors logged with full error message; rate limiter degradation (out of memory) logs warning and fails-open
- Redaction constraints: never log raw IP addresses — hash or truncate for diagnostics

## Tasks

- [ ] **T01: Implement in-memory rate limiter middleware** `est:1h`
  - Why: H-02 — No rate limiting on auth endpoints enables brute-force API key enumeration.
  - Files: `control-plane/src/modules/auth/rate-limiter.ts`, `control-plane/src/modules/auth/rate-limiter.test.ts`, `control-plane/src/modules/auth/index.ts`
  - Do: Create a `RateLimiter` class using a `Map<string, { count: number, resetAt: number }>`. Constructor takes `{ maxRequests: number, windowMs: number, cleanupIntervalMs: number }`. Method `check(ip: string): { allowed: boolean, retryAfterMs: number }`. Add periodic cleanup via `setInterval` that evicts entries where `resetAt < Date.now()` to bound memory. Create an Elysia `beforeHandle` hook that calls `check(request.headers.get('x-forwarded-for') || ip)` and returns 429 with `Retry-After` header when blocked. Apply to `/session/exchange-api-key`, `/saml/exchange-code`, and `/saml/acs` routes. Write tests: under-threshold passes, at-threshold blocks, window reset allows again, different IPs isolated, cleanup evicts expired entries, 429 includes Retry-After header, configurable threshold, fail-open on internal error.
  - Verify: `bun test src/modules/auth/rate-limiter.test.ts` — ≥8 tests pass
  - Done when: Rate limiter returns 429 after configurable threshold and cleans up expired entries.

- [ ] **T02: Implement session and handoff cleanup service** `est:45m`
  - Why: H-04 — Expired sessions and handoff codes accumulate forever, causing database bloat.
  - Files: `control-plane/src/modules/auth/cleanup.ts`, `control-plane/src/modules/auth/cleanup.test.ts`, `control-plane/src/index.ts`
  - Do: Create `startAuthCleanup(db, { intervalMs: number, batchSize: number })` function. On each interval tick: DELETE FROM sessions WHERE expiresAt < NOW() LIMIT batchSize; DELETE FROM saml_handoff_codes WHERE expiresAt < NOW() LIMIT batchSize. Return a `{ stop: () => void }` handle for graceful shutdown. Log count of deleted rows at info level. Wire into `control-plane/src/index.ts` startup with default 5-minute interval and 1000 batch size. Use Drizzle `db.delete().where(lt(sessions.expiresAt, new Date())).limit(batchSize)`. Write tests with FakeDb pattern: expired sessions deleted, active sessions preserved, handoff codes cleaned, batch size respected, stop() clears interval, concurrent cleanup doesn't deadlock.
  - Verify: `bun test src/modules/auth/cleanup.test.ts` — ≥6 tests pass
  - Done when: Expired rows are deleted on interval and active sessions are preserved.

- [ ] **T03: Write SAML handler and config tests** `est:2h`
  - Why: H-03 — SAML handlers (7KB) are security-critical code with zero test coverage. Known SAML vulnerability classes (XML signature wrapping, assertion replay) must be tested.
  - Files: `control-plane/src/modules/auth/saml/handlers.test.ts`, `control-plane/src/modules/auth/saml/config.test.ts`
  - Do: **Config tests:** Test `samlEnabled` returns false when env vars are missing. Test SP/IdP initialization with valid config. Test missing cert file error handling. Test metadata URL vs inline cert config. **Handler tests:** Mock samlify's `sp.parseLoginResponse()` to return controlled assertion data. Test SSO initiation returns redirect to IdP with correct RelayState. Test ACS with valid assertion: creates handoff code, redirects to dashboard with code. Test ACS with invalid/expired assertion: returns error. Test handoff code exchange: valid code returns session token and sets cookie. Test handoff code replay prevention: second exchange fails. Test handoff code expiry: code older than 60s fails. Test JIT user provisioning: new user created from SAML attributes. Test JIT user update: existing user attributes updated. Test SLO: clears session cookie, redirects to IdP SLO URL. Test metadata endpoint: returns valid XML with correct entity ID. Test disabled SAML: all routes return 404 or appropriate error. Test missing DASHBOARD_URL in production: throws at module load.
  - Verify: `bun test src/modules/auth/saml/handlers.test.ts` — ≥15 tests pass. `bun test src/modules/auth/saml/config.test.ts` — ≥5 tests pass.
  - Done when: SAML auth handlers have ≥20 combined test cases covering all handler routes and error paths.

## Files Likely Touched

- `control-plane/src/modules/auth/rate-limiter.ts`
- `control-plane/src/modules/auth/rate-limiter.test.ts`
- `control-plane/src/modules/auth/cleanup.ts`
- `control-plane/src/modules/auth/cleanup.test.ts`
- `control-plane/src/modules/auth/saml/handlers.test.ts`
- `control-plane/src/modules/auth/saml/config.test.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/index.ts`
