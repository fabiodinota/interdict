---
phase: 14-saml-sso-cross-origin-cookie-fix
plan: 01
subsystem: auth
tags: [saml, sso, cookies, cross-origin, next.js]

requires:
  - phase: 10-identity-advanced
    provides: SAML SSO ACS handler and session creation
  - phase: 13-deployment-wiring
    provides: SAML SP cert generation and Helm wiring
provides:
  - Dashboard SAML callback route that sets session cookie on correct origin
  - ACS handler redirect to dashboard callback with token parameter
  - Login page SAML error display with user-friendly messages
affects: [dashboard, control-plane, saml-sso]

tech-stack:
  added: []
  patterns: [cross-origin-cookie-redirect, query-param-token-handoff]

key-files:
  created:
    - dashboard/src/app/api/auth/saml-callback/route.ts
  modified:
    - control-plane/src/modules/auth/saml/handlers.ts
    - dashboard/src/app/login/page.tsx

key-decisions:
  - "Token passed as query parameter in redirect (same pattern as OAuth authorization code flow)"
  - "8-hour cookie maxAge matching session expiry (not 7-day like API key login)"

patterns-established:
  - "Cross-origin cookie pattern: control-plane redirects to dashboard /api/auth/* route which sets cookie on dashboard origin"

requirements-completed: [IDENT-01]

duration: 1min
completed: 2026-03-04
---

# Phase 14 Plan 01: SAML Cross-Origin Cookie Fix Summary

**Dashboard callback route receives SAML session token via redirect and sets httpOnly cookie on the correct origin, fixing the cross-origin cookie loss bug**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-03T23:16:35Z
- **Completed:** 2026-03-03T23:17:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created dashboard SAML callback route that validates token and sets session cookie on dashboard origin
- Modified ACS handler to redirect to dashboard callback instead of setting cookie on control-plane origin
- Added SAML error display to login page with user-friendly messages for missing_token and invalid_session

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dashboard SAML callback route and modify ACS handler** - `d7d628d` (feat)
2. **Task 2: Add SAML error display to login page** - `a6e0ff3` (feat)

## Files Created/Modified
- `dashboard/src/app/api/auth/saml-callback/route.ts` - New GET handler that receives token from ACS redirect, validates against control plane, sets cookie on dashboard origin
- `control-plane/src/modules/auth/saml/handlers.ts` - ACS handler now redirects to dashboard callback with token query param instead of setting cookie directly
- `dashboard/src/app/login/page.tsx` - Added useSearchParams for SAML error display, Suspense wrapper for Next.js 15 compatibility

## Decisions Made
- Token passed as query parameter in redirect (same pattern as OAuth authorization code flow)
- 8-hour cookie maxAge matching session expiry (not 7-day like API key login)
- Suspense wrapper added for Next.js 15 useSearchParams requirement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SAML SSO flow is now end-to-end functional: IdP -> ACS -> redirect to dashboard callback -> cookie set -> dashboard loads
- API key login flow remains unchanged
- Phase 14 complete (single-plan phase)

---
*Phase: 14-saml-sso-cross-origin-cookie-fix*
*Completed: 2026-03-04*
