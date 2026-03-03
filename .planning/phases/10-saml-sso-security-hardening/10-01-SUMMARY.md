---
phase: 10-saml-sso-security-hardening
plan: 01
subsystem: auth
tags: [saml, sso, samlify, sessions, jit-provisioning, dual-auth]

requires:
  - phase: 07-identity-foundation
    provides: "RBAC roles, API key auth, auth middleware macro"
  - phase: 09-dashboard-core-views
    provides: "Login page, BFF proxy pattern, auth cookie flow"
provides:
  - "SAML 2.0 SP module with samlify >= 2.10.0"
  - "Sessions table for opaque session tokens"
  - "Dual-mode auth middleware (API key + session token)"
  - "JIT user provisioning from SAML assertions"
  - "Dashboard SSO login button with conditional display"
affects: [10-saml-sso-security-hardening, 12-helm-sidecar]

tech-stack:
  added: [samlify@2.10.2, "@authenio/samlify-xsd-schema-validator@1.0.5"]
  patterns: [dual-mode-auth, jit-provisioning, client-server-module-split]

key-files:
  created:
    - control-plane/src/modules/auth/saml/config.ts
    - control-plane/src/modules/auth/saml/handlers.ts
    - control-plane/src/modules/auth/saml/metadata.ts
    - dashboard/src/lib/auth-client.ts
  modified:
    - control-plane/src/db/schema/auth.ts
    - control-plane/src/modules/auth/service.ts
    - control-plane/src/modules/auth/middleware.ts
    - control-plane/src/modules/auth/index.ts
    - control-plane/package.json
    - dashboard/src/app/login/page.tsx

key-decisions:
  - "samlify 2.10.2 installed (CVE-2025-47949 safe, >= 2.10.0 required)"
  - "Split dashboard auth into auth.ts (server) and auth-client.ts (client) to avoid next/headers import in client components"
  - "SAML private keys file-mounted only, never env vars (Invariant #6)"
  - "Dual-mode auth: ik_live_* prefix routes to API key flow, all else to session token flow"
  - "JIT provisioning defaults to read_only_auditor role unless valid roleHint from IdP"
  - "Session tokens are 128-char hex (64 random bytes) with 8-hour expiry"
  - "BFF proxy unchanged -- already forwards tokens generically as Bearer tokens"

patterns-established:
  - "Dual-mode auth: middleware distinguishes token types by prefix"
  - "Client/server module split: auth-client.ts for client components, auth.ts for server components"
  - "Conditional SAML routes: only mounted when cert/key/metadata files exist"

requirements-completed: [IDENT-01]

duration: 9min
completed: 2026-03-03
---

# Phase 10 Plan 01: SAML SSO Authentication Summary

**SAML 2.0 SP with samlify 2.10.2, dual-mode auth middleware (API key + session token), JIT user provisioning, and dashboard SSO login flow**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-03T18:35:33Z
- **Completed:** 2026-03-03T18:44:58Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- SAML SP module with SSO redirect, ACS, SLO, and metadata endpoints
- Dual-mode auth middleware accepting both API key tokens and opaque session tokens
- JIT user provisioning: first-time SAML users auto-created with role mapping
- Sessions table with indexed token column for fast lookup
- Dashboard login page with conditional SSO button and visual separator

## Task Commits

Each task was committed atomically:

1. **Task 1: SAML SP module, sessions table, and dual-mode auth middleware** - `7c8c458` (feat)
2. **Task 2: Dashboard SSO login flow and BFF proxy session support** - `40f7061` (feat)

## Files Created/Modified
- `control-plane/src/modules/auth/saml/config.ts` - SAML SP and IdP configuration with file-based certs
- `control-plane/src/modules/auth/saml/handlers.ts` - SSO, ACS, SLO, and metadata route handlers
- `control-plane/src/modules/auth/saml/metadata.ts` - SP metadata XML generator
- `control-plane/src/db/schema/auth.ts` - Added sessions table with token index
- `control-plane/src/modules/auth/service.ts` - Added authenticateBySessionToken, createSession, findOrCreateSamlUser
- `control-plane/src/modules/auth/middleware.ts` - Dual-mode auth (API key + session token)
- `control-plane/src/modules/auth/index.ts` - Wired SAML routes conditionally
- `control-plane/package.json` - Added samlify and XSD validator dependencies
- `dashboard/src/app/login/page.tsx` - SSO login button with conditional display
- `dashboard/src/lib/auth-client.ts` - Client-safe SAML helpers (isSamlEnabled, getSsoUrl, logout)
- `dashboard/src/lib/auth.ts` - Unchanged (server-only, used by BFF proxy)

## Decisions Made
- samlify 2.10.2 pinned (>= 2.10.0 required for CVE-2025-47949 fix, CVSS 9.9)
- Split auth module into server (auth.ts) and client (auth-client.ts) halves because Next.js prevents importing next/headers in client components
- SAML private keys are loaded from file paths only (SAML_SP_KEY_PATH, SAML_SP_CERT_PATH), never from environment variables, per CLAUDE.md Invariant #6
- Token type detection by prefix: ik_live_* triggers API key auth, everything else triggers session token lookup
- JIT provisioning validates roleHint against known VALID_ROLES array; unknown roles default to read_only_auditor
- BFF proxy required no changes -- already forwards cookie value as Bearer token generically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split auth.ts into server and client modules**
- **Found during:** Task 2 (Dashboard SSO login flow)
- **Issue:** Login page ("use client") imported from auth.ts which uses next/headers (server-only), causing Next.js build failure
- **Fix:** Created auth-client.ts with client-safe helpers (isSamlEnabled, getSsoUrl, logout); login page imports from auth-client.ts instead
- **Files modified:** dashboard/src/lib/auth-client.ts, dashboard/src/app/login/page.tsx
- **Verification:** `npx next build` succeeds
- **Committed in:** 40f7061 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for Next.js build compatibility. No scope creep.

## Issues Encountered
- bun was not on PATH; installed via `npm install -g bun` to get bun 1.3.10
- Pre-existing TypeScript errors in src/index.ts (Elysia type issue) -- not introduced by this plan, not fixed

## User Setup Required
None - no external service configuration required. SAML is disabled by default when cert files are absent (graceful degradation).

## Next Phase Readiness
- SAML SP module ready for integration testing with real IdPs (Okta, Azure AD)
- Requires SAML_SP_KEY_PATH, SAML_SP_CERT_PATH, SAML_IDP_METADATA_PATH files for activation
- mTLS and key rotation (Phase 10 remaining plans) can build on this auth foundation

---
*Phase: 10-saml-sso-security-hardening*
*Completed: 2026-03-03*

## Self-Check: PASSED
- All 9 key files verified present
- Both task commits (7c8c458, 40f7061) verified in git log
