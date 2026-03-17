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
