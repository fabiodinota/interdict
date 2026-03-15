# S07: Code Quality & Dashboard Fixes — UAT

**Milestone:** M008
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All changes are code quality fixes verifiable through grep checks, test suites, and static analysis. No new runtime services or UI features require live verification.

## Preconditions

- Repository cloned with all dependencies installed (`bun install` in control-plane, `npm install` in dashboard)
- Rust toolchain available (`cargo`, `clippy`)
- Node.js available for vitest

## Smoke Test

Run `cd dashboard && npx vitest run` — all 53 test files (385 tests) should pass. This confirms the dashboard code quality fixes don't break existing functionality.

## Test Cases

### 1. Dead code removal — auth-client.ts httpOnly cookie clearing

1. Run `grep "document.cookie" dashboard/src/lib/auth-client.ts`
2. **Expected:** No output (exit code 1). The unreachable `document.cookie` clearing line has been removed from `logout()`.
3. Open `dashboard/src/lib/auth-client.ts` and confirm `logout()` still calls the server-side `/api/auth/logout` endpoint and redirects.
4. **Expected:** Server-side logout call and redirect logic remain intact.

### 2. Cookie secure flag configurable via COOKIE_SECURE env var

1. Run `grep "COOKIE_SECURE" dashboard/src/lib/auth.ts`
2. **Expected:** Output shows `process.env.COOKIE_SECURE` usage with ternary checking `=== "true"` and NODE_ENV fallback.
3. Verify the logic: `secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production"`
4. **Expected:** When `COOKIE_SECURE` is set, its value controls the flag. When unset, falls back to `NODE_ENV === "production"`.

### 3. RouteError.tsx production console.error sanitization

1. Open `dashboard/src/components/layout/RouteError.tsx`
2. Find the `console.error` call
3. **Expected:** Wrapped in `if (process.env.NODE_ENV === "development")` — full error logged only in dev, production logs only `"[dashboard] route segment failed"` without the error object.

### 4. Type-safe test fixtures — as any removal

1. Run `grep "as any" dashboard/src/__tests__/components/audit-table.test.tsx`
2. **Expected:** No output (exit code 1). All `as any` casts have been replaced.
3. Run `grep "as unknown as" dashboard/src/__tests__/components/audit-table.test.tsx`
4. **Expected:** Shows `null as unknown as number` casts with explanatory comments about exercising defensive rendering for runtime nulls.

### 5. Dashboard test suite passes

1. Run `cd dashboard && npx vitest run`
2. **Expected:** 53 test files, 385 tests passed, 0 failures.

### 6. ClickHouse empty password production warning

1. Run `grep -A2 "clickhousePassword" control-plane/src/config.ts | grep -i warn`
2. **Expected:** Shows `console.warn` with message containing "ClickHouse password is empty in production mode".
3. Verify the condition: `config.isProduction && !config.clickhousePassword`
4. **Expected:** Warning only fires in production mode with empty password.

### 7. Control-plane test suite passes

1. Run `cd control-plane && bun test`
2. **Expected:** 408 pass, 2 fail (pre-existing `exchangeApiKeyForSession` failures unrelated to S07).

### 8. interdict-verify unwrap replacement

1. Run `grep "unwrap_or_else" crates/interdict-verify/src/main.rs`
2. **Expected:** Shows `.unwrap_or_else(|e| format!(r#"{{"error": "serialization failed: {e}"}}"#))` — graceful fallback instead of panic.
3. Run `grep "\.unwrap()" crates/interdict-verify/src/main.rs`
4. **Expected:** No production `.unwrap()` calls remain in error paths.

### 9. interdict-verify test suite and lint

1. Run `cargo test -p interdict-verify`
2. **Expected:** 24 tests passed, 0 failed.
3. Run `cargo clippy -p interdict-verify -- -D warnings`
4. **Expected:** Zero warnings, exit code 0.

### 10. CSRF protection documentation

1. Open `docs/operator/guide.md`
2. Search for "CSRF Protection"
3. **Expected:** A subsection under Security Hardening explaining:
   - `SameSite=Lax` cookies prevent cross-origin POST CSRF
   - BFF proxy pattern prevents token exposure
   - Multi-tenant deployments should consider explicit CSRF tokens

## Edge Cases

### Cookie secure flag with explicit false in production

1. Set `NODE_ENV=production` and `COOKIE_SECURE=false`
2. **Expected:** Cookie `secure` flag is `false` (env var overrides NODE_ENV).

### Cookie secure flag unset in staging

1. Set `NODE_ENV=staging` (not "production") with no `COOKIE_SECURE` set
2. **Expected:** Cookie `secure` flag is `false` (NODE_ENV !== "production" fallback).

### interdict-verify JSON serialization failure path

1. The `.unwrap_or_else()` fallback produces valid JSON: `{"error": "serialization failed: <reason>"}`
2. **Expected:** No panic/crash — graceful degradation with structured error output.

## Failure Signals

- `npx vitest run` reports any test failures in dashboard
- `bun test` reports new failures beyond the 2 pre-existing ones
- `cargo test -p interdict-verify` reports any failures
- `cargo clippy -p interdict-verify -- -D warnings` reports any warnings
- `grep "document.cookie"` returns matches in auth-client.ts
- `grep "as any"` returns matches in audit-table.test.tsx

## Requirements Proved By This UAT

- AR-CODE-01 — All 7 assessment findings (L-01, L-02, L-03, L-05, L-12, M-01, M-03) verified as fixed through grep checks, test suites, and clippy

## Not Proven By This UAT

- Runtime behavior of cookie secure flag in actual browser sessions (requires deployed environment)
- Runtime behavior of ClickHouse warning at actual service startup (requires running control-plane in production mode)
- Actual CSRF attack prevention (documented posture, not penetration-tested)

## Notes for Tester

- The 2 `exchangeApiKeyForSession` test failures in `bun test` are pre-existing and unrelated to S07. They reflect a test/API mismatch from prior work.
- Running `npx vitest run` from the repo root will fail with "Cannot find package 'bun:test'" errors because vitest picks up control-plane test files that use bun:test imports. Always run from the `dashboard/` directory.
- All changes in this slice are defensive hardening — no visible UI changes or new features.
