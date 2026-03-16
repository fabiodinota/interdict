# S03: Auth, Rate Limiting & Session Fixes

**Goal:** Rate limiting covers write endpoints and expensive operations (60/min shared budget). SAML SLO revokes server session before IdP redirect. Rate limiter IP resolution has robust fallback chain. Department schema has self-referencing FK. Dead code removed.

**Demo:** `bun test` passes with new tests proving: (1) API rate limiter returns 429 after 60 requests on write endpoints, (2) SLO handler calls `revokeSession()` before clearing cookie, (3) IP resolution falls through x-forwarded-for → x-real-ip → socket remoteAddress → "unknown", (4) `rolePermissions` table and `_SESSION_MAX_AGE_SECONDS` constant are gone.

## Must-Haves

- `apiRateLimiter` instance (60/min, env-configurable) shared across all write endpoints
- `createRateLimitHook` attaches to `POST /policies`, `POST /reports/generate`, `POST /signing-keys/rotate`, `POST /vendors` via per-route `beforeHandle` (D047)
- IP resolution fallback chain: `x-forwarded-for` → `x-real-ip` → `server.requestIP(request)` → `"unknown"`
- SAML SLO extracts session token from cookie, calls `authService.revokeSession()`, then clears cookie and redirects
- `_SESSION_MAX_AGE_SECONDS` constant removed from `handlers.ts`
- `departments.parentDepartmentId` has `.references(() => departments.id, { onDelete: "set null" })`
- `rolePermissions` table removed from schema, index export, and seed script
- Drizzle migration generated for FK addition and table drop

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts` — all existing + new tests pass (IP fallback chain: x-real-ip, socket remoteAddress, unknown; API rate limiter 429 after threshold)
- `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts` — SLO session revocation test passes
- `cd control-plane && bun test` — full suite passes
- `rg "rolePermissions" control-plane/src/` returns zero hits
- `rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/` returns zero hits
- Migration SQL file exists in `control-plane/drizzle/` containing ALTER TABLE departments + DROP TABLE role_permissions
- Rate limiter 429 response body includes `{ code: "RATE_LIMITED", message: ... }` and `Retry-After` header (verified via test assertions)
- Rate limiter fail-open behavior verified: broken limiter still returns 200 (existing test covers this)

## Observability / Diagnostics

- Runtime signals: rate limiter `console.warn` on fail-open (existing), `[rate-limiter]` prefix on all log lines
- Inspection surfaces: 429 response body includes `{ code: "RATE_LIMITED", message: ... }` and `Retry-After` header
- Failure visibility: rate limiter internal errors logged with error message, request continues (fail-open)
- Redaction constraints: IP addresses hashed before logging (existing RateLimiter behavior)

## Integration Closure

- Upstream surfaces consumed: `RateLimiter` class and `createRateLimitHook()` from `rate-limiter.ts`, `authService.revokeSession()` from `service.ts`
- New wiring introduced: `apiRateLimiter` export from `auth/index.ts`, imported in 4 endpoint modules; SLO handler accesses `store.db` for authService creation
- What remains: S06 exposes rate limit rejection counts as Prometheus metrics (consumes the same `apiRateLimiter` instance)

## Tasks

- [x] **T01: Expand rate limiter IP fallback and add apiRateLimiter to write endpoints** `est:45m`
  - Why: Core of this slice — closes FH-SECURITY-02 requirement for rate limiting on write/expensive endpoints and robust IP resolution
  - Files: `control-plane/src/modules/auth/rate-limiter.ts`, `control-plane/src/modules/auth/rate-limiter.test.ts`, `control-plane/src/modules/auth/index.ts`, `control-plane/src/modules/policies/index.ts`, `control-plane/src/modules/reports/index.ts`, `control-plane/src/modules/signing-keys/index.ts`, `control-plane/src/modules/vendors/index.ts`
  - Do:
    1. In `rate-limiter.ts`, update `createRateLimitHook` signature to accept optional `server` parameter. Expand IP resolution: after `x-forwarded-for`, try `x-real-ip` header, then `server?.requestIP(request)?.address`, then `"unknown"`. Type the `server` parameter as `{ requestIP: (req: Request) => { address: string } | null } | undefined`.
    2. In `auth/index.ts`, create `apiRateLimiter` as a second `RateLimiter` instance with defaults `maxRequests: 60, windowMs: 60_000`, configurable via `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` env vars (same pattern as existing `authRateLimiter`). Export it.
    3. In each of the 4 endpoint modules (`policies`, `reports`, `signing-keys`, `vendors`), import `apiRateLimiter` and `createRateLimitHook` from `../auth` (or `../../auth` depending on nesting). Add `{ beforeHandle: createRateLimitHook(apiRateLimiter) }` as the options argument to the target `.post()` calls: `POST /` in policies, `POST /generate` in reports, `POST /rotate` in signing-keys, `POST /` in vendors.
    4. In `rate-limiter.test.ts`, add tests: (a) x-real-ip fallback when x-forwarded-for absent, (b) socket remoteAddress fallback when both headers absent, (c) "unknown" fallback when all sources absent, (d) x-forwarded-for takes precedence over x-real-ip, (e) API rate limiter returns 429 after 60 requests.
  - Verify: `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts` passes with all new + existing tests
  - Done when: all 5 new tests pass, 14 existing tests still pass, `apiRateLimiter` is wired to 4 POST endpoints

- [x] **T02: Fix SAML SLO to revoke server session before cookie clear** `est:20m`
  - Why: SLO handler clears the cookie but leaves the session row in Postgres — a leaked token could still authenticate until TTL expiry. Also removes dead `_SESSION_MAX_AGE_SECONDS` constant.
  - Files: `control-plane/src/modules/auth/saml/handlers.ts`, `control-plane/src/modules/auth/saml/handlers.test.ts`
  - Do:
    1. In `handlers.ts`, remove the `_SESSION_MAX_AGE_SECONDS` constant on line 30 (unused — session TTL is managed by `createSession` in `service.ts`).
    2. In the SLO handler (`.get("/slo", ...)`), expand `rawCtx` destructuring to include `store` (same pattern as the ACS handler: `store: { db?: typeof pgDb }`). Before clearing the cookie, extract the session token value: `const sessionToken = (cookie[SESSION_COOKIE_NAME] as { value?: string })?.value`. If a token exists, create an `authService` from `store.db ?? pgDb` via `createAuthService(db)`, then `await authService.revokeSession(sessionToken)`. Wrap in try/catch — SLO must succeed even if revocation fails (log warning with `[saml] SLO session revocation failed`). Then proceed with existing cookie clear + redirect logic.
    3. In `handlers.test.ts`, add a test: "SLO revokes server session before clearing cookie" — mock `createAuthService` to return a spy `revokeSession`, simulate a request with a session cookie, assert `revokeSession` was called with the cookie value, and assert the response clears the cookie and redirects.
  - Verify: `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts` passes with new SLO test
  - Done when: SLO test proves `revokeSession` called before redirect, `_SESSION_MAX_AGE_SECONDS` grep returns 0 hits

- [ ] **T03: Department self-referencing FK and dead code removal** `est:25m`
  - Why: Closes the department FK gap (self-referencing constraint) and removes dead `rolePermissions` table + seed logic that was never read at runtime.
  - Files: `control-plane/src/db/schema/organization.ts`, `control-plane/src/db/schema/auth.ts`, `control-plane/src/db/schema/index.ts`, `control-plane/src/seed/run-seed.ts`
  - Do:
    1. In `organization.ts`, add `.references(() => departments.id, { onDelete: "set null" })` to the `parentDepartmentId` column definition. This is a self-referencing FK — Drizzle supports this pattern.
    2. In `auth.ts`, remove the `rolePermissions` table definition (starts at line ~155). Remove its import from other files if any exist in that file.
    3. In `schema/index.ts`, remove the `rolePermissions` re-export (line ~11).
    4. In `run-seed.ts`, remove the `rolePermissions` import (line ~26) and the seed block that populates it (lines ~249-255). If the block is inside a loop or conditional, remove just the `rolePermissions`-specific logic.
    5. Run `cd control-plane && bun run db:generate` to produce a migration. Inspect the generated SQL: expect `ALTER TABLE "departments" ADD CONSTRAINT ... FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL` and `DROP TABLE "role_permissions"`. If the migration includes unexpected changes, investigate before committing.
    6. Run `rg "rolePermissions" control-plane/src/` to verify zero remaining references.
    7. Run `cd control-plane && bun test` to verify full test suite passes (no tests should depend on `rolePermissions` since it was never read at runtime).
  - Verify: `cd control-plane && bun test` passes, `rg "rolePermissions" control-plane/src/` returns 0 hits, migration SQL is clean
  - Done when: migration file exists with FK + table drop, full `bun test` passes, zero rolePermissions references remain

## Files Likely Touched

- `control-plane/src/modules/auth/rate-limiter.ts`
- `control-plane/src/modules/auth/rate-limiter.test.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/modules/policies/index.ts`
- `control-plane/src/modules/reports/index.ts`
- `control-plane/src/modules/signing-keys/index.ts`
- `control-plane/src/modules/vendors/index.ts`
- `control-plane/src/modules/auth/saml/handlers.ts`
- `control-plane/src/modules/auth/saml/handlers.test.ts`
- `control-plane/src/db/schema/organization.ts`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/src/db/schema/index.ts`
- `control-plane/src/seed/run-seed.ts`
- `control-plane/drizzle/*.sql` (generated migration)
