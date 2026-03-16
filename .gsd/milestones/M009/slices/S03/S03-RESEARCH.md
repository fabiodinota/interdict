# S03: Auth, Rate Limiting & Session Fixes — Research

**Date:** 2026-03-16

## Summary

This slice is straightforward application of established patterns already in the codebase. The `RateLimiter` class and `createRateLimitHook` per-route `beforeHandle` pattern (D047) are proven and tested with 14 existing tests. The work is: (1) create a second `apiRateLimiter` instance at 60/min, (2) attach `createRateLimitHook(apiRateLimiter)` to 5 write/expensive endpoints, (3) fix the SAML SLO handler to call `authService.revokeSession()` before IdP redirect, (4) improve IP resolution in `createRateLimitHook` to fall back through `x-real-ip` → `server.requestIP(request)` → `"unknown"`, (5) add self-referencing FK to `departments.parentDepartmentId` + generate migration, (6) remove dead `rolePermissions` table and unused `_SESSION_MAX_AGE_SECONDS` constant.

No new libraries, no novel patterns, no risky integration. Every change follows existing code conventions.

## Recommendation

Build in three independent tasks: (1) rate limiter expansion + IP fallback (biggest change, most tests), (2) SAML SLO session revocation fix, (3) department FK + dead code removal. Tasks 2 and 3 are small and independent — task 1 is the core work.

## Implementation Landscape

### Key Files

- `control-plane/src/modules/auth/rate-limiter.ts` — `RateLimiter` class and `createRateLimitHook()`. IP resolution needs x-real-ip and socket remoteAddress fallback chain added to the hook. The hook's context type must expand to accept `server` (Bun's `Server` instance for `server.requestIP(request)`).
- `control-plane/src/modules/auth/rate-limiter.test.ts` — 14 existing tests. Add tests for: x-real-ip fallback, socket remoteAddress fallback, unknown fallback when all headers absent.
- `control-plane/src/modules/auth/index.ts` — Creates `authRateLimiter` (10/min). Add `apiRateLimiter` (60/min, env-configurable via `API_RATE_LIMIT_MAX` / `API_RATE_LIMIT_WINDOW_MS`). Export it for use by other modules.
- `control-plane/src/modules/policies/index.ts` — `POST /` (create policy, calls `validateRego`) needs `apiRateLimiter` hook. This is the "policy compile" expensive operation.
- `control-plane/src/modules/reports/index.ts` — `POST /generate` (report generation, PDF/CSV) needs `apiRateLimiter` hook.
- `control-plane/src/modules/signing-keys/index.ts` — `POST /rotate` (key rotation) needs `apiRateLimiter` hook.
- `control-plane/src/modules/vendors/index.ts` — `POST /` (create vendor) needs `apiRateLimiter` hook.
- `control-plane/src/modules/auth/saml/handlers.ts` — SLO handler at line ~160 clears cookie but doesn't call `authService.revokeSession()`. Must extract session token from cookie, revoke it, then continue. Also has unused `_SESSION_MAX_AGE_SECONDS` constant to remove.
- `control-plane/src/modules/auth/saml/handlers.test.ts` — Existing 25 handler tests + 7 config tests. Add test for SLO session revocation.
- `control-plane/src/db/schema/organization.ts` — `departments.parentDepartmentId` is `uuid("parent_department_id")` with no `.references()` call. Add `.references(() => departments.id, { onDelete: "set null" })` for self-referencing FK.
- `control-plane/src/db/schema/auth.ts` — `rolePermissions` table definition (line ~155). Dead code — `permissions.ts` uses in-memory `DEFAULT_PERMISSIONS`, never reads from this table at runtime.
- `control-plane/src/db/schema/index.ts` — Re-exports `rolePermissions`. Remove the export.
- `control-plane/src/seed/run-seed.ts` — Populates `rolePermissions` table (lines ~249-255). Seed logic should be removed or converted to a no-op comment.
- `control-plane/src/index.ts` — Where module `.use()` calls are wired. Rate limiter instances need to be importable from a shared location — `auth/index.ts` already exports `authRateLimiter`, so `apiRateLimiter` follows the same pattern.

### Build Order

1. **Rate limiter expansion + IP fallback** — this is the largest change and the core of the slice. Build the `apiRateLimiter` instance, update `createRateLimitHook` IP resolution, attach hooks to 5 endpoints, add tests. This unblocks verification of the primary requirement (FH-SECURITY-02).

2. **SAML SLO session revocation** — independent fix. The SLO handler needs access to `authService` (requires `db` in scope — the handler already receives `store` from Elysia context). Extract token from cookie value, call `revokeSession()`, then proceed with cookie clear + redirect. Remove `_SESSION_MAX_AGE_SECONDS`. Add test.

3. **Department FK + dead code** — independent cleanup. Add `.references()` to schema, run `bun run db:generate` to produce migration, remove `rolePermissions` table + seed logic. The migration needs careful handling: it alters a table that may have data.

### Verification Approach

- `cd control-plane && bun test` — all existing + new tests pass
- Specific test targets: `bun test src/modules/auth/rate-limiter.test.ts` for IP fallback + API rate limiter tests
- `bun test src/modules/auth/saml/handlers.test.ts` for SLO revocation test
- Verify migration generates cleanly: `bun run db:generate` should produce a new `.sql` file with `ALTER TABLE departments ADD CONSTRAINT ... FOREIGN KEY (parent_department_id) REFERENCES departments(id)` and `DROP TABLE role_permissions`
- Grep verification: `rg "rolePermissions" control-plane/src/` should return zero hits after cleanup
- Grep verification: `rg "_SESSION_MAX_AGE_SECONDS" control-plane/src/` should return zero hits

## Constraints

- Elysia 1.4 `onBeforeHandle` in `.use()` plugins doesn't short-circuit (D047) — must use per-route `beforeHandle` via `createRateLimitHook()`.
- `server.requestIP(request)` is Bun-specific API — the hook type must accept `server?: { requestIP: (req: Request) => { address: string } | null }` and handle non-Bun environments gracefully (fallback to "unknown").
- The `rolePermissions` table is populated by the seed script. Removing the table schema means the seed must also be updated. If any deployed instance depends on this table for future customization, the migration is breaking — but the code never reads from it at runtime, so it's safe.
- Drizzle migration for self-referencing FK on `departments` must use `onDelete: "set null"` (not cascade) to avoid recursive deletion of the entire tree when a parent department is removed.

## Common Pitfalls

- **Shared rate limiter instance vs per-module instance** — The `apiRateLimiter` must be a single shared instance so the 60/min budget is shared across all write endpoints per IP. Creating separate instances per module would give each module its own independent 60/min window, which defeats the purpose. Export from `auth/index.ts` and import in each module.
- **SLO cookie extraction** — Elysia's `cookie` object in the handler provides `.value` for reading. The session token is in `cookie[SESSION_COOKIE_NAME].value`. Must read before calling `.set({ maxAge: 0 })` which clears it.
- **Migration ordering** — The migration must DROP `role_permissions` and ALTER `departments` in the correct order. Drizzle generates these as separate statements, so ordering is handled automatically.
