---
id: T01
parent: S07
milestone: M008
provides:
  - Dashboard dead code removal (auth-client.ts)
  - Configurable cookie secure flag via COOKIE_SECURE env var
  - Production-safe console.error in RouteError.tsx
  - Type-safe test fixtures in audit-table.test.tsx
key_files:
  - dashboard/src/lib/auth-client.ts
  - dashboard/src/lib/auth.ts
  - dashboard/src/components/layout/RouteError.tsx
  - dashboard/src/__tests__/components/audit-table.test.tsx
key_decisions:
  - Used `null as unknown as number` instead of `as any` for null-handling test fixture — preserves explicit intent while satisfying type checker
patterns_established:
  - Environment-variable override pattern for cookie flags: check env var first, fall back to NODE_ENV-based default
observability_surfaces:
  - RouteError.tsx logs full error object only in development; production shows only the message prefix
duration: 8m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Fix dashboard code quality issues

**Removed dead client-side cookie clearing, made cookie secure flag configurable, sanitized production console.error, and replaced `as any` with typed test fixtures.**

## What Happened

Four dashboard code quality issues addressed:

1. **auth-client.ts (L-01):** Removed the `document.cookie` line from `logout()`. The httpOnly session cookie cannot be cleared client-side — only the server-side `/api/auth/logout` route can clear it. The redirect to SLO/login still works.

2. **auth.ts (M-01):** Changed `secure` flag from hardcoded `NODE_ENV === "production"` to a two-tier check: if `COOKIE_SECURE` env var is set, use its value; otherwise fall back to the production check. This lets staging environments control the flag explicitly.

3. **RouteError.tsx (L-02):** Wrapped the `console.error` in an environment check — full error object logged only in development, production logs only the prefix string `"[dashboard] route segment failed"` to prevent stack trace leakage.

4. **audit-table.test.tsx (L-05):** Replaced `null as any` casts with `null as unknown as number`, adding a comment explaining that the test exercises defensive rendering for runtime nulls that the TypeScript type doesn't model.

## Verification

- `grep "document.cookie" dashboard/src/lib/auth-client.ts` → 0 matches ✅
- `grep "COOKIE_SECURE" dashboard/src/lib/auth.ts` → shows env var usage ✅
- `grep "as any" dashboard/src/__tests__/components/audit-table.test.tsx` → 0 matches ✅
- `npx vitest run` → 53 test files, 385 tests passed ✅

### Slice-level verification (partial — T01 is not the final task):
- ✅ `grep "document.cookie" dashboard/src/lib/auth-client.ts` returns 0 matches
- ✅ `npx vitest run` — all dashboard tests pass
- ✅ `grep "COOKIE_SECURE" dashboard/src/lib/auth.ts` shows env var usage
- ⏳ `bun test` — control-plane tests (T02 scope)
- ⏳ `cargo test -p interdict-verify` (T02 scope)
- ⏳ `cargo clippy -p interdict-verify` (T02 scope)
- ⏳ `grep "clickhouse.*warn"` — ClickHouse warning (T02 scope)

## Diagnostics

- RouteError: In production browser console, only `[dashboard] route segment failed` appears (no stack trace). In development, full error details visible.
- Cookie secure flag: Verify via browser DevTools → Application → Cookies → check `Secure` attribute. Override with `COOKIE_SECURE=true|false` env var.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `dashboard/src/lib/auth-client.ts` — Removed dead `document.cookie` clearing from logout()
- `dashboard/src/lib/auth.ts` — Made cookie `secure` flag configurable via `COOKIE_SECURE` env var
- `dashboard/src/components/layout/RouteError.tsx` — Conditional console.error: full error in dev, sanitized in prod
- `dashboard/src/__tests__/components/audit-table.test.tsx` — Replaced `as any` with `as unknown as number` typed casts
- `.gsd/milestones/M008/slices/S07/S07-PLAN.md` — Marked T01 done, added Observability section
