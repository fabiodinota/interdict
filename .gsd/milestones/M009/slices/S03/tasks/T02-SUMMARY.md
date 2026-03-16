---
id: T02
parent: S03
milestone: M009
provides:
  - SAML SLO server-side session revocation before cookie clear
  - Dead _SESSION_MAX_AGE_SECONDS constant removed
key_files:
  - control-plane/src/modules/auth/saml/handlers.ts
  - control-plane/src/modules/auth/saml/handlers.test.ts
key_decisions:
  - SLO revocation is fail-open — revocation failure logs a warning but doesn't block cookie clear or IdP redirect
patterns_established:
  - SLO handler accesses store.db for authService creation (same pattern as ACS handler)
observability_surfaces:
  - "[saml] SLO session revocation failed: <message>" console.warn on revocation failure
duration: 8m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Fix SAML SLO to revoke server session before cookie clear

**SLO handler now calls `authService.revokeSession(token)` before clearing the session cookie, closing the token-reuse-after-logout gap. Dead `_SESSION_MAX_AGE_SECONDS` constant removed.**

## What Happened

1. Removed unused `_SESSION_MAX_AGE_SECONDS` constant from `handlers.ts` (session TTL is managed by `createSession` in `service.ts`).
2. Expanded SLO handler's `rawCtx` destructuring to include `store` (matching ACS handler pattern) and added `value` to the cookie type.
3. Added session revocation block before cookie clear: extracts token from cookie, creates authService via `store.db ?? pgDb`, calls `revokeSession(sessionToken)`. Wrapped in try/catch with `console.warn` — SLO continues even if revocation fails.
4. Updated the test file's inline `buildTestApp` SLO route to mirror the same revocation logic using the mock authService.
5. Added 3 new tests: (a) revocation called with correct token, (b) SLO continues on revocation failure with warning log, (c) revocation skipped when no cookie present.

## Verification

- `bun test src/modules/auth/saml/handlers.test.ts` — **28 pass, 0 fail** (25 original + 3 new SLO revocation tests)
- `rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/` — **zero hits**
- `bun test src/modules/auth/rate-limiter.test.ts` — **17 pass, 0 fail** (T01 tests still green)

### Slice-level verification status (T02 of 3):
- ✅ `bun test src/modules/auth/rate-limiter.test.ts` — all pass
- ✅ `bun test src/modules/auth/saml/handlers.test.ts` — SLO revocation test passes
- ⬜ `bun test` — full suite (deferred to T03)
- ⬜ `rg "rolePermissions" control-plane/src/` — T03 scope
- ✅ `rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/` — zero hits
- ⬜ Migration SQL with ALTER TABLE + DROP TABLE — T03 scope

## Diagnostics

- Grep for `[saml] SLO session revocation failed` to find revocation failures at runtime
- Revocation failure is fail-open: cookie is still cleared, redirect still happens — the session row persists until TTL expiry (same as pre-fix behavior, but now observable via the warning log)
- No new status endpoint — revocation is inline in the SLO request path

## Deviations

- Plan mentioned 32 existing tests; actual count was 25 handler tests (the file has no separate config tests block). All 25 original tests pass, plus 3 new ones = 28 total.
- Added 3 tests instead of 1: the additional "continues on failure" and "skips when no cookie" tests cover the error path and no-op path, which are important for a fail-open design.

## Known Issues

None.

## Files Created/Modified

- `control-plane/src/modules/auth/saml/handlers.ts` — Removed dead `_SESSION_MAX_AGE_SECONDS` constant; added session revocation to SLO handler with fail-open error handling
- `control-plane/src/modules/auth/saml/handlers.test.ts` — Updated buildTestApp SLO route with revocation logic; added 3 new SLO revocation tests
- `.gsd/milestones/M009/slices/S03/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
