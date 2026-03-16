# S03: Auth, Rate Limiting & Session Fixes — UAT

**Milestone:** M009
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are testable via `bun test` and static grep checks — no running server or browser required. Rate limiting, SLO revocation, and schema changes are fully covered by unit/integration tests.

## Preconditions

- Working directory: `control-plane/`
- Bun installed and available on PATH
- No database connection required (tests use mocks)

## Smoke Test

Run `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts` — 17 tests pass including IP fallback chain and API rate limit 429 threshold.

## Test Cases

### 1. API rate limiter returns 429 after 60 requests

1. Run `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts`
2. Find test: "returns 429 after 60 requests from the same IP"
3. **Expected:** Test sends 61 requests from the same IP. First 60 return status 200. Request 61 returns status 429 with body `{ success: false, error: { code: "RATE_LIMITED" } }` and a `Retry-After` header.

### 2. IP resolution falls through x-forwarded-for → x-real-ip → socket → unknown

1. Run `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts`
2. Find tests under "createRateLimitHook IP resolution fallback"
3. **Expected:** 4 tests pass:
   - x-forwarded-for takes precedence over x-real-ip
   - x-real-ip used when x-forwarded-for absent
   - server.requestIP used when both headers absent
   - "unknown" used when all IP sources absent

### 3. Rate limiter fail-open on internal error

1. Run `cd control-plane && bun test src/modules/auth/rate-limiter.test.ts`
2. Find test: "fails open when limiter throws"
3. **Expected:** When rate limiter throws an internal error, request continues (200 not 500). Warning logged with `[rate-limiter]` prefix.

### 4. SLO revokes server session before clearing cookie

1. Run `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts`
2. Find test: "SLO revokes server session before clearing cookie"
3. **Expected:** Mock `revokeSession` is called with the session token value from the cookie. Response clears the cookie and redirects to IdP SLO URL.

### 5. SLO continues when revocation fails

1. Run `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts`
2. Find test: "SLO continues with redirect when session revocation fails"
3. **Expected:** When `revokeSession` throws, SLO still clears the cookie and redirects. Warning logged with `[saml] SLO session revocation failed`.

### 6. SLO skips revocation when no cookie present

1. Run `cd control-plane && bun test src/modules/auth/saml/handlers.test.ts`
2. Find test: "SLO skips revocation when no session cookie present"
3. **Expected:** `revokeSession` is not called. Response still redirects.

### 7. Dead _SESSION_MAX_AGE_SECONDS constant removed

1. Run `grep -r "_SESSION_MAX_AGE_SECONDS" control-plane/src/`
2. **Expected:** Zero hits.

### 8. rolePermissions table fully removed

1. Run `grep -r "rolePermissions" control-plane/src/`
2. **Expected:** Zero hits.

### 9. Migration SQL is correct

1. Read `control-plane/src/db/migrations/0004_department_fk_drop_role_permissions.sql`
2. **Expected:** Contains `ALTER TABLE "departments" ADD CONSTRAINT ... FOREIGN KEY ("parent_department_id") REFERENCES ... ("id") ON DELETE set null` and `DROP TABLE "role_permissions"`. Also drops the `role_permissions_role_perm_idx` index.

### 10. Department self-referencing FK in schema

1. Read `control-plane/src/db/schema/organization.ts`
2. Find `parentDepartmentId` column definition
3. **Expected:** Column has `.references(() => departments.id, { onDelete: "set null" })`.

### 11. apiRateLimiter wired to 4 write endpoints

1. Run `grep -rn "createRateLimitHook(apiRateLimiter)" control-plane/src/modules/`
2. **Expected:** 4 hits in: `policies/index.ts`, `reports/index.ts`, `signing-keys/index.ts`, `vendors/index.ts`.

### 12. Full test suite regression

1. Run `cd control-plane && bun test`
2. **Expected:** 404+ tests pass. Only pre-existing failures allowed (exchangeApiKeyForSession not implemented, DATABASE_URL env missing, proto path errors). No new failures.

## Edge Cases

### Rate limiter with no IP sources

1. `createRateLimitHook` is called with a request that has no x-forwarded-for, no x-real-ip, and no server parameter.
2. **Expected:** IP resolves to `"unknown"`. Rate limiting still enforced — all such requests share the "unknown" bucket.

### SLO with empty cookie value

1. Session cookie exists but has empty string value.
2. **Expected:** Revocation skipped (falsy check on token value). Cookie cleared and redirect proceeds normally.

### apiRateLimiter env var override

1. Inspect `control-plane/src/modules/auth/index.ts` for `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS` env var usage.
2. **Expected:** Environment variables configure maxRequests and windowMs respectively, with defaults of 60 and 60000.

## Failure Signals

- `bun test src/modules/auth/rate-limiter.test.ts` reports <17 passing tests or any failure
- `bun test src/modules/auth/saml/handlers.test.ts` reports <28 passing tests or any failure
- `grep -r "rolePermissions" control-plane/src/` returns any hit
- `grep -r "_SESSION_MAX_AGE_SECONDS" control-plane/src/` returns any hit
- Migration 0004 missing or contains unexpected statements
- `grep "createRateLimitHook(apiRateLimiter)" control-plane/src/modules/` returns fewer than 4 hits
- Any new test failure in `bun test` full suite (beyond the 4 pre-existing ones)

## Requirements Proved By This UAT

- FH-SECURITY-02 — Rate limiting on write endpoints (60/min threshold + 429 response), SAML SLO session revocation, IP resolution fallback chain. Partially proved: "review ingest auth at middleware level" not addressed.

## Not Proven By This UAT

- Runtime rate limiting behavior under actual HTTP traffic (tests use mocked Elysia context)
- Database migration execution (0004 is verified as SQL artifact, not applied to a live DB)
- Prometheus metrics for rate limit rejections (S06 scope)
- The `server.requestIP()` fallback path works with a real Bun Server instance (tested with mock)

## Notes for Tester

- The 4 pre-existing failures in `bun test` are environment issues in the worktree (missing DATABASE_URL, proto files, unimplemented method). They are not S03 regressions.
- Migration 0004 was hand-written (D068) — this is the established pattern since 0003 was also hand-written. drizzle-kit generate does not work for this project's current state.
