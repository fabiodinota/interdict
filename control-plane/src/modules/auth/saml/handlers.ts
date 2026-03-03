/**
 * SAML SSO Route Handlers
 *
 * Endpoints:
 *   GET  /api/v1/auth/saml/sso      -- Initiate SSO redirect to IdP
 *   POST /api/v1/auth/saml/acs      -- Assertion Consumer Service (processes IdP response)
 *   GET  /api/v1/auth/saml/slo      -- Single Logout (clears session, redirects to IdP SLO)
 *   GET  /api/v1/auth/saml/metadata -- SP metadata XML for IdP configuration
 *
 * Security notes:
 * - ACS and metadata endpoints are unauthenticated (they create/serve auth context)
 * - Session tokens are set as httpOnly cookies (never exposed to client JS)
 * - SAML private keys are file-mounted, never in env vars (CLAUDE.md Invariant #6)
 */

import { Elysia } from "elysia";
import { sp, idp, samlEnabled } from "./config";
import { getSpMetadata } from "./metadata";
import { createAuthService } from "../service";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:8080";
const SESSION_COOKIE_NAME = "interdict_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

/**
 * Extract SAML attributes from the parsed assertion.
 * Different IdPs use different attribute names, so we check common variants.
 */
function extractAttributes(extract: any): {
  email: string;
  displayName: string;
  roleHint: string | undefined;
} {
  const nameID = extract.nameID || "";

  // Attributes may be in extract.attributes or directly on extract
  const attrs = extract.attributes || extract;

  const email =
    nameID ||
    attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
    attrs["email"] ||
    attrs["Email"] ||
    "";

  const displayName =
    attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] ||
    attrs["displayName"] ||
    attrs["DisplayName"] ||
    attrs["name"] ||
    email.split("@")[0] ||
    "SAML User";

  const roleHint =
    attrs["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
    attrs["role"] ||
    attrs["Role"] ||
    undefined;

  return { email, displayName, roleHint };
}

/**
 * Create the SAML routes Elysia plugin.
 * Only mounted when samlEnabled is true.
 */
export function createSamlRoutes() {
  if (!samlEnabled || !sp || !idp) {
    // Return empty plugin if SAML is disabled
    return new Elysia({ prefix: "/saml" });
  }

  // Capture non-null references for use in closures (TS can't narrow module exports)
  const spRef = sp;
  const idpRef = idp;

  return new Elysia({ prefix: "/saml" })

    // -----------------------------------------------------------------------
    // GET /sso -- Initiate SAML SSO Login
    // -----------------------------------------------------------------------
    .get("/sso", async ({ redirect }) => {
      const { context: loginRequestUrl } = spRef.createLoginRequest(idpRef, "redirect");
      return redirect(loginRequestUrl);
    })

    // -----------------------------------------------------------------------
    // POST /acs -- Assertion Consumer Service
    // -----------------------------------------------------------------------
    .post("/acs", async ({ body, store, cookie, redirect }: any) => {
      try {
        // Parse and validate the SAML response
        const parseResult = await spRef.parseLoginResponse(idpRef, "post", {
          body,
        });

        const { email, displayName, roleHint } = extractAttributes(
          parseResult.extract
        );

        if (!email) {
          return new Response("SAML assertion missing email/nameID", {
            status: 400,
          });
        }

        // JIT provision user and create session
        const authService = createAuthService(store.db);
        const user = await authService.findOrCreateSamlUser(
          email,
          displayName,
          parseResult.extract.nameID || email,
          roleHint
        );

        const sessionToken = await authService.createSession(user.id);

        // Redirect to dashboard callback route with token.
        // The dashboard sets the cookie on its own origin, solving
        // the cross-origin cookie problem (control-plane origin != dashboard origin).
        const callbackUrl = `${DASHBOARD_URL}/api/auth/saml-callback?token=${sessionToken}`;
        return redirect(callbackUrl);
      } catch (err: any) {
        console.error("[SAML] ACS error:", err.message || err);
        return new Response("SAML authentication failed", { status: 401 });
      }
    })

    // -----------------------------------------------------------------------
    // GET /slo -- Single Logout
    // -----------------------------------------------------------------------
    .get("/slo", async ({ cookie, redirect }: any) => {
      // Clear session cookie
      cookie[SESSION_COOKIE_NAME].set({
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      // If IdP has SLO endpoint configured, redirect there
      const idpMeta = idpRef.entityMeta;
      const sloUrl =
        idpMeta?.getSingleLogoutService?.("redirect") ||
        null;

      if (sloUrl) {
        return redirect(sloUrl);
      }

      // Otherwise redirect to dashboard login
      return redirect(`${DASHBOARD_URL}/login`);
    })

    // -----------------------------------------------------------------------
    // GET /metadata -- SP Metadata XML
    // -----------------------------------------------------------------------
    .get("/metadata", () => {
      const metadata = getSpMetadata();
      if (!metadata) {
        return new Response("SAML not configured", { status: 503 });
      }
      return new Response(metadata, {
        headers: { "Content-Type": "application/xml" },
      });
    });
}
