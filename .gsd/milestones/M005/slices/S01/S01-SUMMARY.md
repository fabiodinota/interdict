---
id: S01
parent: M005
milestone: M005
provides: []
requires: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
drill_down_paths: []
duration: 
verification_result: passed
completed_at: 
blocker_discovered: false
---
# S01: Secret Session Seed Hardening

**# Plan 30-01 Summary**

## What Happened

# Plan 30-01 Summary

- Built `control-plane/src/seed/key-output.ts` to format seed credential notifications without ever rendering plaintext key material.
- Rewired `control-plane/src/seed/run-seed.ts` to keep only recipient email and key prefix metadata in operator output and removed the `SEED_SHOW_KEYS` reveal branch.
- Verified with `bun test src/seed/key-output.test.ts` and `bunx tsc --noEmit` in `control-plane`.

Key files:
- `control-plane/src/seed/key-output.ts`
- `control-plane/src/seed/key-output.test.ts`
- `control-plane/src/seed/run-seed.ts`

# Plan 30-02 Summary

- Added typed API-key exchange schemas plus `AuthService.exchangeApiKeyForSession()` so valid API keys mint opaque stored-hash sessions instead of being reused directly.
- Exposed `POST /api/v1/auth/session/exchange-api-key` and added focused service and endpoint tests covering success and invalid-credential rejection.
- Verified with `bun test src/modules/auth/service.test.ts src/modules/auth/index.test.ts` and `bunx tsc --noEmit` in `control-plane`.

Key files:
- `control-plane/src/modules/auth/model.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/modules/auth/service.test.ts`
- `control-plane/src/modules/auth/index.test.ts`

# Plan 30-03 Summary

- Added dashboard-side login parsing helpers so malformed or missing auth bodies are rejected before any control-plane call.
- Switched dashboard login to the control-plane exchange endpoint and stored only the returned opaque session token in the `interdict_session` httpOnly cookie.
- Kept `/api/auth/me` and `/api/auth/logout` aligned with the opaque-session model and refreshed route tests for malformed, valid, and failure paths.
- Verified with `npx vitest run src/__tests__/api/auth-login.test.ts src/__tests__/api/auth-me.test.ts src/__tests__/api/auth-logout.test.ts` and `npm run typecheck` in `dashboard`.

Key files:
- `dashboard/src/lib/auth.ts`
- `dashboard/src/app/api/auth/login/route.ts`
- `dashboard/src/app/api/auth/me/route.ts`
- `dashboard/src/app/api/auth/logout/route.ts`
- `dashboard/src/__tests__/api/auth-login.test.ts`
- `dashboard/src/__tests__/api/auth-me.test.ts`
- `dashboard/src/__tests__/api/auth-logout.test.ts`
