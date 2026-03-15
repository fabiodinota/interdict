---
id: T02
parent: S07
milestone: M008
provides:
  - ClickHouse empty password warning in production config
  - interdict-verify panic-free JSON error serialization
  - CSRF protection documentation in operator guide
key_files:
  - control-plane/src/config.ts
  - crates/interdict-verify/src/main.rs
  - docs/operator/guide.md
key_decisions:
  - none — all changes followed the slice plan verbatim
patterns_established:
  - Startup warning pattern for insecure-by-default config in production (console.warn with `[config] WARNING:` prefix)
observability_surfaces:
  - "[config] WARNING: ClickHouse password is empty in production mode" log line on control-plane startup
  - interdict-verify stderr `{"error": "serialization failed: ..."}` on JSON serialization failure (replaces panic)
duration: 8m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Fix control-plane and Rust code quality issues

**Added ClickHouse empty-password production warning, replaced interdict-verify `.unwrap()` with graceful fallback, and documented CSRF protection posture in operator guide.**

## What Happened

Three changes per the slice plan:

1. **config.ts (L-03):** Added a `console.warn` after config construction that fires when `isProduction && !config.clickhousePassword`. Uses the `[config] WARNING:` prefix consistent with the existing `checkOpaBinary` warning pattern.

2. **main.rs (L-12):** Replaced `serde_json::to_string_pretty(&err_json).unwrap()` with `.unwrap_or_else(|e| format!(r#"{{"error": "serialization failed: {e}"}}"#))`. The fallback produces valid JSON even if the serde serialization itself fails — eliminates the only production `.unwrap()` in the error path.

3. **docs/operator/guide.md (M-03):** Added a "CSRF Protection" subsection under Security Hardening. Documents the two-layer defense (`SameSite=Lax` cookies + BFF proxy pattern) and advises multi-tenant deployments to consider explicit CSRF tokens for same-site subdomain scenarios.

## Verification

- `cargo test -p interdict-verify` — 24 passed, 0 failed
- `cargo clippy -p interdict-verify -- -D warnings` — zero warnings
- `bun test` (control-plane) — 408 pass, 2 fail (pre-existing `exchangeApiKeyForSession` failures, unrelated to config change)
- `grep "clickhouse.*warn\|warn.*clickhouse" control-plane/src/config.ts` — matches line 74
- Slice-level checks:
  - `grep "document.cookie" dashboard/src/lib/auth-client.ts` — 0 matches ✓ (T01)
  - `grep "COOKIE_SECURE" dashboard/src/lib/auth.ts` — matches ✓ (T01)
  - `grep "clickhouse.*warn" control-plane/src/config.ts` — matches ✓ (T02)
  - `cargo test -p interdict-verify` — all pass ✓ (T02)
  - `cargo clippy -p interdict-verify -- -D warnings` — zero warnings ✓ (T02)
  - `npx vitest run` — not re-run (T01 verified, no dashboard changes in T02)
  - `bun test` — 408 pass ✓ (2 pre-existing failures unrelated to T02)

## Diagnostics

- **ClickHouse password warning:** On control-plane startup with `NODE_ENV=production` and empty `CLICKHOUSE_PASSWORD`, stdout shows `[config] WARNING: ClickHouse password is empty in production mode. Set CLICKHOUSE_PASSWORD in .env.`
- **interdict-verify error path:** When JSON serialization fails, stderr shows `{"error": "serialization failed: ..."}` instead of a panic/crash.

## Deviations

None.

## Known Issues

- 2 pre-existing `exchangeApiKeyForSession` test failures in control-plane (unrelated to this task).

## Files Created/Modified

- `control-plane/src/config.ts` — Added ClickHouse empty password production warning
- `crates/interdict-verify/src/main.rs` — Replaced `.unwrap()` with `.unwrap_or_else()` fallback
- `docs/operator/guide.md` — Added CSRF Protection subsection under Security Hardening
