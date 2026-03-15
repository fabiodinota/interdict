# S07: Code Quality & Dashboard Fixes

**Goal:** Fix all low-severity code quality findings across dashboard, control-plane, and Rust CLI.
**Demo:** Dead code removed, console.error sanitized, cookie secure flag configurable, ClickHouse warns on empty password, interdict-verify unwrap replaced. All tests pass.

## Must-Haves

- Dead `document.cookie` code removed from auth-client.ts
- RouteError.tsx console.error sanitized (generic message in production, full error in development)
- Cookie `secure` flag configurable via `COOKIE_SECURE` env var (default: `true` in production, `false` otherwise)
- ClickHouse password warns at startup when empty and `NODE_ENV=production`
- interdict-verify production unwrap replaced with proper error handling
- `as any` removed from audit-table.test.tsx
- CSRF posture documented in security section of operator guide

## Verification

- `grep "document.cookie" dashboard/src/lib/auth-client.ts` returns 0 matches for the dead httpOnly cookie clearing
- `npx vitest run` — all dashboard tests pass
- `bun test` — all control-plane tests pass
- `cargo test -p interdict-verify` — all tests pass
- `cargo clippy -p interdict-verify -- -D warnings` — zero warnings
- `grep "COOKIE_SECURE" dashboard/src/lib/auth.ts` shows env var usage
- `grep "clickhouse.*warn\|warn.*clickhouse" control-plane/src/config.ts` shows warning logic

## Tasks

- [ ] **T01: Fix dashboard code quality issues** `est:30m`
  - Why: L-01, L-02, L-05, M-01 — Dead code, production error leaks, cookie security, test type safety.
  - Files: `dashboard/src/lib/auth-client.ts`, `dashboard/src/lib/auth.ts`, `dashboard/src/components/layout/RouteError.tsx`, `dashboard/src/__tests__/components/audit-table.test.tsx`
  - Do: **auth-client.ts (L-01):** Remove the `document.cookie = \`${COOKIE_NAME}=; path=/; max-age=0\`` line from `logout()`. The httpOnly cookie cannot be cleared client-side — the server-side `/api/auth/logout` route handles this. Keep the server-side logout call. **auth.ts (M-01):** Change `secure: process.env.NODE_ENV === "production"` to `secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production"`. This allows staging environments to explicitly control the secure flag. Update the corresponding test if one exists. **RouteError.tsx (L-02):** Change `console.error("[dashboard] route segment failed", error)` to only log the full error in development: `if (process.env.NODE_ENV === "development") { console.error("[dashboard] route segment failed", error); } else { console.error("[dashboard] route segment failed"); }`. This prevents stack traces in production browser consoles. **audit-table.test.tsx (L-05):** Replace `as any` with proper type assertions or correctly typed mock data. Inspect what types are being cast and create properly typed test fixtures.
  - Verify: `npx vitest run` passes. `grep "document.cookie" dashboard/src/lib/auth-client.ts` returns no httpOnly clearing.
  - Done when: All 4 dashboard code quality issues are fixed.

- [ ] **T02: Fix control-plane and Rust code quality issues** `est:20m`
  - Why: L-03, L-12, M-03 — ClickHouse password warning, interdict-verify unwrap, CSRF documentation.
  - Files: `control-plane/src/config.ts`, `crates/interdict-verify/src/main.rs`, `docs/operator/guide.md`
  - Do: **config.ts (L-03):** After config object construction, add: `if (config.isProduction && !config.clickhousePassword) { console.warn("[config] WARNING: ClickHouse password is empty in production mode. Set CLICKHOUSE_PASSWORD in .env."); }`. **main.rs (L-12):** Replace `serde_json::to_string_pretty(&err_json).unwrap()` with `serde_json::to_string_pretty(&err_json).unwrap_or_else(|e| format!("{{\"error\": \"serialization failed: {e}\"}}"))`  — the fallback produces valid JSON even if serialization fails. **CSRF documentation (M-03):** Add a "CSRF Protection" section to the security chapter of `docs/operator/guide.md` explaining: `sameSite: "lax"` cookies prevent cross-origin POST CSRF; BFF proxy pattern prevents token exposure; for multi-tenant deployments, consider adding CSRF tokens.
  - Verify: `bun test` passes. `cargo test -p interdict-verify` passes. `cargo clippy -p interdict-verify -- -D warnings` — zero warnings.
  - Done when: ClickHouse warns on empty password, interdict-verify has no production unwraps, CSRF posture documented.

## Files Likely Touched

- `dashboard/src/lib/auth-client.ts`
- `dashboard/src/lib/auth.ts`
- `dashboard/src/components/layout/RouteError.tsx`
- `dashboard/src/__tests__/components/audit-table.test.tsx`
- `control-plane/src/config.ts`
- `crates/interdict-verify/src/main.rs`
- `docs/operator/guide.md`
