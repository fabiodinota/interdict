# Phase 14: SAML SSO Cross-Origin Cookie Fix - Research

**Researched:** 2026-03-04
**Domain:** Cross-origin authentication handoff (SAML ACS to Next.js dashboard)
**Confidence:** HIGH

## Summary

Phase 14 fixes a cross-origin cookie loss bug where the SAML ACS handler (control-plane, port 3000) sets an `interdict_session` httpOnly cookie on its own domain, then 302 redirects to the dashboard (port 8080). The browser scopes Set-Cookie to the responding origin, making the cookie invisible to the dashboard. The middleware sees no session and loops back to `/login`.

The fix is a well-understood pattern: instead of setting the cookie on the control-plane origin, the ACS handler redirects to a dashboard callback route (e.g., `/api/auth/saml-callback?token=<sessionToken>`) that runs server-side on the dashboard origin, sets the cookie there, then redirects to `/`. This is the same pattern the existing API key login already uses (`/api/auth/login` sets the cookie on the dashboard origin).

**Primary recommendation:** Add a Next.js API route at `dashboard/src/app/api/auth/saml-callback/route.ts` that accepts the session token as a query parameter, validates it against the control plane, sets the cookie, and redirects to `/`. Modify the ACS handler to redirect to this callback instead of directly to `DASHBOARD_URL`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDENT-01 | User can authenticate via SAML 2.0 SSO with enterprise IdPs (Okta, Azure AD) | This phase closes the final integration gap -- SAML ACS code and deployment wiring are complete (Phases 10, 13), only the cross-origin cookie handoff is broken. Fix involves 2 files changed, 1 file added. |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This phase modifies existing files using the existing stack.

| Library | Version | Purpose | Already Present |
|---------|---------|---------|-----------------|
| Next.js | 15 | Dashboard framework (API routes for callback) | Yes |
| Elysia | (current) | Control plane SAML handler modification | Yes |

### Supporting

No additional libraries required. The session token validation uses the existing BFF proxy pattern (server-side fetch to control plane `/api/v1/auth/me`).

## Architecture Patterns

### Current Authentication Flow (API Key - Working)

```
Browser -> POST /api/auth/login (dashboard origin)
         -> Server-side fetch to control-plane /api/v1/auth/me
         -> Set-Cookie on dashboard origin
         -> Redirect to /
```

This works because the login route is a Next.js API route running on the dashboard origin.

### Current SAML Flow (Broken)

```
Browser -> GET control-plane/api/v1/auth/saml/sso
         -> 302 to IdP
         -> POST control-plane/api/v1/auth/saml/acs (IdP callback)
         -> Set-Cookie on control-plane origin  <-- PROBLEM
         -> 302 to DASHBOARD_URL
         -> Dashboard middleware: no cookie -> 302 to /login  <-- LOOP
```

### Fixed SAML Flow (Target)

```
Browser -> GET control-plane/api/v1/auth/saml/sso
         -> 302 to IdP
         -> POST control-plane/api/v1/auth/saml/acs (IdP callback)
         -> 302 to DASHBOARD_URL/api/auth/saml-callback?token=<sessionToken>
         -> Dashboard callback: validate token, Set-Cookie on dashboard origin
         -> 302 to /
         -> Dashboard middleware: cookie present -> allow
```

### File Changes Required

```
MODIFY: control-plane/src/modules/auth/saml/handlers.ts
  - Lines 116-129: Remove cookie setting, redirect to dashboard callback with token

ADD: dashboard/src/app/api/auth/saml-callback/route.ts
  - GET handler: extract token from query, validate via control plane, set cookie, redirect

MODIFY: dashboard/src/middleware.ts
  - Add /api/auth/saml-callback to allowed paths (already covered by isApiRoute check)
```

### Pattern: Dashboard Callback Route

The callback route follows the same pattern as the existing `/api/auth/login` route:

```typescript
// dashboard/src/app/api/auth/saml-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getControlPlaneUrl, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  // Validate token against control plane (same as /api/auth/me)
  const controlPlaneUrl = getControlPlaneUrl();
  const res = await fetch(`${controlPlaneUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.redirect(new URL("/login?error=invalid_session", request.url));
  }

  // Set cookie on dashboard origin and redirect to home
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60, // 8 hours (match session expiry)
    path: "/",
  });

  return response;
}
```

### ACS Handler Modification

```typescript
// control-plane/src/modules/auth/saml/handlers.ts - ACS handler change
// BEFORE (lines 116-129):
const sessionToken = await authService.createSession(user.id);
cookie[SESSION_COOKIE_NAME].set({ ... });
return redirect(DASHBOARD_URL);

// AFTER:
const sessionToken = await authService.createSession(user.id);
// Do NOT set cookie here -- wrong origin
// Redirect to dashboard callback which sets cookie on correct origin
const callbackUrl = `${DASHBOARD_URL}/api/auth/saml-callback?token=${sessionToken}`;
return redirect(callbackUrl);
```

### Anti-Patterns to Avoid

- **Setting cookies across origins via redirect:** Browsers scope Set-Cookie to the responding origin. A 302 redirect does not carry cookies to the target domain. This is the exact bug being fixed.
- **Passing tokens in URL fragments (#):** Fragments are not sent to the server. Use query parameters for server-side route handlers.
- **Skipping token validation in the callback:** The callback must validate the token against the control plane before setting the cookie, to prevent forged tokens.
- **Using POST for the callback:** The IdP redirect chain ends with a browser navigation (GET). The callback must be a GET handler.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie setting | Custom header manipulation | NextResponse.cookies.set() | Handles encoding, SameSite, Secure flags correctly |
| Token validation | Custom session DB lookup from dashboard | Fetch to control-plane /api/v1/auth/me | Dashboard has no direct DB access; BFF pattern is established |
| URL construction | String concatenation with user input | URL constructor or template with known-safe token | Session tokens are hex-only (generated by randomBytes), but good hygiene |

## Common Pitfalls

### Pitfall 1: Token Exposure in Browser History/Logs
**What goes wrong:** Session token appears in URL query string, gets logged in server access logs and browser history.
**Why it happens:** Using GET with query parameter to pass the token.
**How to avoid:** This is acceptable because (a) the token is a one-time-use transport mechanism -- once the cookie is set, the URL is never revisited, (b) session tokens are 128-char random hex with 8-hour expiry, (c) the redirect to `/` immediately clears the URL from the address bar. For additional hardening, the ACS could use a short-lived one-time code instead of the raw session token, but this adds complexity disproportionate to the risk for a pilot deployment.
**Warning signs:** If tokens were long-lived or reusable credentials, this would be a real concern.

### Pitfall 2: Middleware Blocking the Callback Route
**What goes wrong:** Dashboard middleware intercepts `/api/auth/saml-callback` and redirects to `/login` before the handler runs.
**Why it happens:** Misconfigured middleware matcher.
**How to avoid:** The existing middleware already has `if (isApiRoute) return NextResponse.next()` which passes through all `/api/` routes. The callback route at `/api/auth/saml-callback` is already covered. No middleware changes needed.
**Warning signs:** If the callback route returned a non-redirect response and the middleware was more restrictive.

### Pitfall 3: Cookie maxAge Mismatch
**What goes wrong:** Dashboard cookie has different expiry than the session in the database.
**Why it happens:** API key login uses 7-day maxAge but sessions expire in 8 hours.
**How to avoid:** Use 8-hour maxAge in the SAML callback (matching `SESSION_MAX_AGE_SECONDS` in the ACS handler and the session creation in auth service). Note: the existing API key login at `/api/auth/login` uses 7 days because API keys don't expire the same way.
**Warning signs:** Users getting "Session expired" errors from the control plane while the cookie is still present.

### Pitfall 4: SameSite Cookie Attribute Blocking the Redirect Chain
**What goes wrong:** Cookie not sent during the redirect from IdP.
**Why it happens:** `SameSite=Strict` would block cookies on cross-site redirects.
**How to avoid:** Use `SameSite=Lax` (already the pattern in both existing cookie-setting locations). Lax allows cookies on top-level GET navigations, which is exactly what the SAML redirect chain produces.
**Warning signs:** Authentication working in some browsers but not others.

## Code Examples

### Existing Pattern Reference: API Key Login (dashboard/src/app/api/auth/login/route.ts)

The SAML callback follows the identical pattern -- validate credentials server-side, set httpOnly cookie on dashboard origin:

```typescript
// Lines 33-45 of existing login/route.ts
const response = NextResponse.json({ success: true, data: userData.data });
response.cookies.set(SESSION_COOKIE_NAME, apiKey, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60,
  path: "/",
});
```

The SAML callback differs only in: (a) using GET instead of POST, (b) returning a redirect instead of JSON, (c) using 8-hour maxAge instead of 7 days.

### Existing Pattern Reference: Control-Plane Auth Middleware (dual-mode)

The control-plane auth middleware already handles both API keys (ik_live_ prefix) and session tokens. The BFF proxy sends the cookie value as a Bearer token. The SAML session token (128-char hex) will be correctly routed through the session token path.

## State of the Art

No technology changes needed. This is a straightforward cross-origin cookie fix using patterns already established in the codebase.

| Current (Broken) | Fixed | Impact |
|-------------------|-------|--------|
| ACS sets cookie on control-plane origin | ACS redirects to dashboard callback | Cookie visible to dashboard middleware |
| Dashboard middleware redirects to /login | Middleware sees cookie, allows access | SAML login completes end-to-end |

## Open Questions

1. **Should the token be a one-time code instead of the raw session token?**
   - What we know: Session tokens are 128-char random hex, 8-hour expiry, httpOnly. Exposure in URL is brief (immediate redirect).
   - What's unclear: Whether pilot security requirements mandate one-time exchange codes.
   - Recommendation: Use raw session token for simplicity. A one-time code pattern (ACS creates short-lived code, callback exchanges it for the real token) adds a database round-trip and complexity. For pilot scope, the direct token approach is standard and sufficient. Can be hardened in v1.2 if security audit requires it.

2. **Should the login page show an error message from the callback?**
   - What we know: The callback redirects to `/login?error=...` on failure.
   - What's unclear: Whether the login page should parse and display the error query param.
   - Recommendation: Add minimal error display to the login page for `?error=invalid_session` and `?error=missing_token`. This is a small UX improvement that aids debugging.

## Sources

### Primary (HIGH confidence)
- Direct code review of `control-plane/src/modules/auth/saml/handlers.ts` (ACS handler, lines 116-129)
- Direct code review of `dashboard/src/middleware.ts` (session cookie check)
- Direct code review of `dashboard/src/app/api/auth/login/route.ts` (working cookie-setting pattern)
- Direct code review of `dashboard/src/lib/auth.ts` and `auth-client.ts` (auth utilities)
- Direct code review of `control-plane/src/modules/auth/middleware.ts` (dual-mode auth)
- `.planning/v1.1-MILESTONE-AUDIT.md` (gap analysis and recommended fix)

### Secondary (MEDIUM confidence)
- Browser cookie scoping behavior (Set-Cookie scoped to responding origin) -- well-documented web standard, RFC 6265

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, uses existing patterns
- Architecture: HIGH - fix pattern is identical to existing working API key login flow
- Pitfalls: HIGH - well-understood browser cookie behavior, all pitfalls verified against codebase

**Research date:** 2026-03-04
**Valid until:** Indefinite (browser cookie scoping is a stable web standard)
