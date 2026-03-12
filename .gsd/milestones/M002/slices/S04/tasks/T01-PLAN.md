# T01: 10-saml-sso-security-hardening 01

**Slice:** S04 — **Milestone:** M002

## Description

Implement SAML 2.0 SSO authentication for enterprise IdPs (Okta, Azure AD) with JIT user provisioning.

Purpose: Bank pilot requires SAML SSO -- users authenticate via corporate IdP instead of API keys. This is the IDENT-01 requirement.
Output: Working SAML SP in control plane, dual-mode auth middleware (API key + session), SSO login flow on dashboard.

## Must-Haves

- [ ] "User can initiate SAML SSO login from the dashboard and be redirected to IdP"
- [ ] "After IdP authentication, user is redirected back to ACS endpoint and a session is created"
- [ ] "SAML-authenticated user can access all dashboard views using session token in httpOnly cookie"
- [ ] "Auth middleware accepts both API key tokens (ik_live_*) and opaque session tokens"
- [ ] "First-time SAML user is auto-provisioned via JIT with correct role mapping"

## Files

- `control-plane/src/modules/auth/saml/config.ts`
- `control-plane/src/modules/auth/saml/handlers.ts`
- `control-plane/src/modules/auth/saml/metadata.ts`
- `control-plane/src/modules/auth/middleware.ts`
- `control-plane/src/modules/auth/service.ts`
- `control-plane/src/modules/auth/index.ts`
- `control-plane/src/db/schema/auth.ts`
- `control-plane/package.json`
- `dashboard/src/app/login/page.tsx`
- `dashboard/src/app/api/proxy/[...path]/route.ts`
