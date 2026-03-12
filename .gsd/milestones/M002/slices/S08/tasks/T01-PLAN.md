# T01: 14-saml-sso-cross-origin-cookie-fix 01

**Slice:** S08 — **Milestone:** M002

## Description

Fix the SAML SSO cross-origin cookie loss bug so that SAML login completes end-to-end.

Purpose: The ACS handler (control-plane, port 3000) currently sets the session cookie on its own origin, then redirects to the dashboard (port 8080). The browser scopes Set-Cookie to the responding origin, making the cookie invisible to the dashboard. The fix redirects to a dashboard callback route that sets the cookie on the correct origin -- the same pattern the existing API key login uses.

Output: Working SAML SSO flow where user authenticates via IdP and lands in the dashboard with a valid session.

## Must-Haves

- [ ] "After SAML authentication, user lands in the dashboard with a valid session (no redirect loop)"
- [ ] "Session cookie is set on the dashboard origin, not the control-plane origin"
- [ ] "Existing API key authentication flow remains unaffected"
- [ ] "Invalid or missing tokens in the callback redirect to /login with an error message"

## Files

- `control-plane/src/modules/auth/saml/handlers.ts`
- `dashboard/src/app/api/auth/saml-callback/route.ts`
- `dashboard/src/app/login/page.tsx`
