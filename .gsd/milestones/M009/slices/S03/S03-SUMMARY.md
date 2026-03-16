---
id: S03
parent: M009
milestone: M009
provides:
  - apiRateLimiter shared instance (60/min, env-configurable via API_RATE_LIMIT_MAX / API_RATE_LIMIT_WINDOW_MS)
  - Per-route beforeHandle rate limiting on 4 write POST endpoints (policies, reports, signing-keys, vendors)
  - IP resolution fallback chain: x-forwarded-for → x-real-ip → server.requestIP → "unknown"
  - SAML SLO server-side session revocation before cookie clear (fail-open)
  - Department self-referencing FK (parentDepartmentId → departments.id, ON DELETE SET NULL)
  - Dead code removed: rolePermissions table, _SESSION_MAX_AGE_SECONDS constant
  - Migration 0004: FK constraint + rolePermissions table drop
requires: []
affects:
  - S06
key_files:
  - control-plane/src/modules/auth/rate-limiter.ts
  - control-plane/src/modules/auth/rate-limiter.test.ts
  - control-plane/src/modules/auth/index.ts
  - control-plane/src/modules/auth/saml/handlers.ts
  - control-plane/src/modules/auth/saml/handlers.test.ts
  - control-plane/src/db/schema/organization.ts
  - control-plane/src/db/schema/auth.ts
  - control-plane/src/db/schema/index.ts
  - control-plane/src/seed/run-seed.ts
  - control-plane/src/db/migrations/0004_department_fk_drop_role_permissions.sql
  - control-plane/src/modules/policies/index.ts
  - control-plane/src/modules/reports/index.ts
  - control-plane/src/modules/signing-keys/index.ts
  - control-plane/src/modules/vendors/index.ts
key_decisions:
  - D047 per-route beforeHandle pattern applied to 4 write endpoints (established in M008/S02, extended here)
  - D068 hand-written migration 0004 because drizzle-kit journal is out of sync with 0003+
  - D069 SLO revocation is fail-open — revocation failure logs a warning but doesn't block logout flow
patterns_established:
  - Per-route `beforeHandle: createRateLimitHook(apiRateLimiter)` on write POST endpoints (D047)
  - IP resolution: x-forwarded-for → x-real-ip → server.requestIP(request) → "unknown"
  - SLO handler accesses store.db for authService creation (same pattern as ACS handler)
observability_surfaces:
  - 429 response body: `{ success: false, error: { code: "RATE_LIMITED", message: "..." } }` + `Retry-After` header
  - console.warn `[rate-limiter]` on rate limit exceeded with hashed IP
  - console.warn `[rate-limiter]` on internal error (fail-open continues request)
  - console.warn `[saml] SLO session revocation failed: <message>` on revocation failure
  - RateLimiter.getStats() returns { trackedIPs, evictionCount } for runtime inspection
drill_down_paths:
  - .gsd/milestones/M009/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M009/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M009/slices/S03/tasks/T03-SUMMARY.md
duration: 43m
verification_result: passed
completed_at: 2026-03-16
---

# S03: Auth, Rate Limiting & Session Fixes

**Rate limiting extended to 4 write endpoints (60/min), SAML SLO now revokes server session before cookie clear, department FK constraint added, dead rolePermissions table and unused constant removed.**

## What Happened

Three tasks delivered the full slice scope:

**T01 — Rate limiter expansion.** Extended `createRateLimitHook` with a 4-step IP resolution chain (x-forwarded-for → x-real-ip → server.requestIP → "unknown") and created a shared `apiRateLimiter` (60 req/min, env-configurable). Wired it to `POST /policies`, `POST /reports/generate`, `POST /admin/signing-keys/rotate`, and `POST /vendors` using per-route `beforeHandle` (D047 pattern). The hook signature accepts an optional `server` parameter typed for Bun's Server API — backward-compatible with existing callers. 5 new tests cover all IP fallback branches and the 60-request 429 threshold.

**T02 — SAML SLO session revocation.** The SLO handler previously cleared the cookie but left the session row in Postgres, meaning a leaked token could authenticate until TTL expiry. Now extracts the session token from the cookie, creates an authService via `store.db`, and calls `revokeSession()` before clearing the cookie. Wrapped in try/catch — SLO is fail-open to ensure logout always completes even if the DB is unreachable (D069). Also removed the dead `_SESSION_MAX_AGE_SECONDS` constant. 3 new tests cover: revocation called, failure continues, no-cookie skips.

**T03 — Schema cleanup.** Added `.references(() => departments.id, { onDelete: "set null" })` to `parentDepartmentId` for the self-referencing FK. Removed `rolePermissions` from schema, index export, and seed script. Cleaned stale doc comments referencing the removed table. Hand-wrote migration 0004 (D068) since drizzle-kit can't resolve the delta with 0003 also being hand-written.

## Verification

- `bun test src/modules/auth/rate-limiter.test.ts` — **17/17 pass**, 168 expect() calls
- `bun test src/modules/auth/saml/handlers.test.ts` — **28/28 pass**, 60 expect() calls
- `bun test` full suite — **407 pass, 4 fail** (all pre-existing: 2 × `exchangeApiKeyForSession` not implemented, 1 × missing `DATABASE_URL` env, 1 × missing proto files in worktree)
- `grep -r "rolePermissions" control-plane/src/` — zero hits
- `grep -r "_SESSION_MAX_AGE_SECONDS" control-plane/src/` — zero hits
- Migration 0004 contains `ALTER TABLE "departments" ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE set null` and `DROP TABLE "role_permissions"`
- 429 response body includes `{ code: "RATE_LIMITED" }` and `Retry-After` header (verified via test assertions)
- Fail-open behavior verified (existing test)

## Requirements Advanced

- FH-SECURITY-02 — Rate limiting now covers write endpoints (60/min on 4 POST endpoints) alongside existing auth rate limit (10/min). SAML SLO revokes server sessions. IP resolution has robust fallback chain. "Review ingest auth at middleware level" remains for future assessment.

## Requirements Validated

- none — FH-SECURITY-02 is advanced but not fully validated (ingest auth middleware review outstanding)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T02: Plan expected 32 existing SAML tests; actual count was 25 handler tests (no separate config block in this file). Added 3 tests instead of 1 to cover error and no-op paths — important for fail-open design.
- T03: Migration hand-written instead of `drizzle-kit generate` (consistent with established pattern, recorded as D068). Also cleaned stale comments in `permissions.ts` referencing removed table (not in original plan, necessary for completeness).

## Known Limitations

- drizzle-kit journal/snapshot state is out of sync with actual migrations (0003+ not tracked). Future migration generation requires either syncing the journal or continuing the hand-written pattern.
- 4 pre-existing test failures in `bun test` full suite are unrelated to S03 (missing `exchangeApiKeyForSession` implementation, env/path issues in worktree).

## Follow-ups

- S06 will expose `apiRateLimiter` rejection counts as Prometheus metrics (consumes the same instance).
- "Review ingest auth at middleware level" from FH-SECURITY-02 not addressed — may be covered by a future assessment sweep or deferred intentionally.

## Files Created/Modified

- `control-plane/src/modules/auth/rate-limiter.ts` — IP resolution fallback chain (x-forwarded-for → x-real-ip → server.requestIP → unknown)
- `control-plane/src/modules/auth/rate-limiter.test.ts` — 5 new tests: IP fallback ×4, API threshold ×1
- `control-plane/src/modules/auth/index.ts` — Added `apiRateLimiter` export (60/min, env-configurable)
- `control-plane/src/modules/policies/index.ts` — `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /
- `control-plane/src/modules/reports/index.ts` — `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /generate
- `control-plane/src/modules/signing-keys/index.ts` — `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /rotate
- `control-plane/src/modules/vendors/index.ts` — `beforeHandle: createRateLimitHook(apiRateLimiter)` on POST /
- `control-plane/src/modules/auth/saml/handlers.ts` — SLO session revocation + removed `_SESSION_MAX_AGE_SECONDS`
- `control-plane/src/modules/auth/saml/handlers.test.ts` — 3 new SLO revocation tests
- `control-plane/src/db/schema/organization.ts` — Self-referencing FK on parentDepartmentId
- `control-plane/src/db/schema/auth.ts` — Removed rolePermissions table, cleaned imports/comments
- `control-plane/src/db/schema/index.ts` — Removed rolePermissions re-export
- `control-plane/src/seed/run-seed.ts` — Removed rolePermissions import and seed block
- `control-plane/src/modules/auth/permissions.ts` — Updated stale comment referencing role_permissions
- `control-plane/src/db/migrations/0004_department_fk_drop_role_permissions.sql` — FK constraint + table drop

## Forward Intelligence

### What the next slice should know
- `apiRateLimiter` is exported from `control-plane/src/modules/auth/index.ts` — S06 can import it directly to expose rejection counts as Prometheus metrics.
- The `createRateLimitHook` factory accepts an optional `server` parameter but none of the 4 current callers pass it (Elysia route handlers don't have access to the Bun Server object in `beforeHandle`). The IP fallback still works via headers and `"unknown"`.
- drizzle-kit migration generation is broken for this project — migrations 0003 and 0004 are both hand-written. Plan accordingly for any future schema changes.

### What's fragile
- drizzle-kit journal sync — any attempt to run `drizzle-kit generate` will likely produce incorrect deltas or interactive prompts that can't be resolved automatically. Hand-write migrations until the journal is rebuilt.
- SLO fail-open means a revocation failure is only visible via `[saml] SLO session revocation failed` log line — no metric, no status endpoint. Until S06 adds Prometheus metrics, grep is the only diagnostic.

### Authoritative diagnostics
- `bun test src/modules/auth/rate-limiter.test.ts` — 17 tests proving both rate limiter instances, all IP fallback branches, and fail-open behavior. This is the canonical test file for rate limiting correctness.
- `bun test src/modules/auth/saml/handlers.test.ts` — 28 tests covering all SAML handler paths including the 3 new SLO revocation tests.
- Migration 0004 SQL — readable, well-commented, safe to inspect for FK and DROP correctness.

### What assumptions changed
- Plan assumed drizzle-kit could generate the migration — it can't because journal state diverged at 0003. Hand-written pattern is now established (D068).
- Plan assumed 32 existing SAML handler tests — actual was 25 (file doesn't have a separate config test block). Total after T02 is 28.
