# S08: Saml Sso Cross Origin Cookie Fix

**Goal:** Fix the SAML SSO cross-origin cookie loss bug so that SAML login completes end-to-end.
**Demo:** Fix the SAML SSO cross-origin cookie loss bug so that SAML login completes end-to-end.

## Must-Haves


## Tasks

- [x] **T01: 14-saml-sso-cross-origin-cookie-fix 01**
  - Fix the SAML SSO cross-origin cookie loss bug so that SAML login completes end-to-end.

Purpose: The ACS handler (control-plane, port 3000) currently sets the session cookie on its own origin, then redirects to the dashboard (port 8080). The browser scopes Set-Cookie to the responding origin, making the cookie invisible to the dashboard. The fix redirects to a dashboard callback route that sets the cookie on the correct origin -- the same pattern the existing API key login uses.

Output: Working SAML SSO flow where user authenticates via IdP and lands in the dashboard with a valid session.

## Files Likely Touched

- `control-plane/src/modules/auth/saml/handlers.ts`
- `dashboard/src/app/api/auth/saml-callback/route.ts`
- `dashboard/src/app/login/page.tsx`
