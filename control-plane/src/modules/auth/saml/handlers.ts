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
import { db as pgDb } from "../../../db/postgres";
import { type AuthService, createAuthService } from "../service";
import { idp, samlEnabled, sp } from "./config";
import { getSpMetadata } from "./metadata";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL ??
  (process.env.NODE_ENV !== "production" ? "http://localhost:8080" : undefined);
if (!DASHBOARD_URL) {
  throw new Error("[saml] DASHBOARD_URL env var is required in production");
}
const SESSION_COOKIE_NAME = "interdict_session";
const _SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

/** Shape returned by samlify's parseLoginResponse */
interface SamlExtract {
  nameID?: string;
  attributes?: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

/**
 * Extract SAML attributes from the parsed assertion.
 * Different IdPs use different attribute names, so we check common variants.
 */
function extractAttributes(extract: SamlExtract): {
  email: string;
  displayName: string;
  roleHint: string | undefined;
} {
  const nameID = extract.nameID ?? "";

  // Attributes may be in extract.attributes or directly on extract
  const attrs: Record<string, string | string[] | undefined> =
    extract.attributes ?? (extract as Record<string, string | string[] | undefined>);

  const first = (v: string | string[] | undefined): string =>
    Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

  const email =
    nameID ||
    first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]) ||
    first(attrs.email) ||
    first(attrs.Email) ||
    "";

  const displayName =
    first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]) ||
    first(attrs.displayName) ||
    first(attrs.DisplayName) ||
    first(attrs.name) ||
    email.split("@")[0] ||
    "SAML User";

  // roleHint is accepted but IGNORED for role assignment (CRIT-001)
  const roleHint =
    first(attrs["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]) ||
    first(attrs.role) ||
    first(attrs.Role) ||
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

  return (
    new Elysia({ prefix: "/saml" })

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
      .post("/acs", async (rawCtx) => {
        const { body, store, redirect } = rawCtx as {
          body: Record<string, unknown>;
          store: { db?: typeof pgDb };
          redirect: (url: string) => Response;
        };
        try {
          // Parse and validate the SAML response
          const parseResult = await spRef.parseLoginResponse(idpRef, "post", {
            body,
          });

          const { email, displayName, roleHint } = extractAttributes(
            parseResult.extract as SamlExtract,
          );

          if (!email) {
            return new Response("SAML assertion missing email/nameID", {
              status: 400,
            });
          }

          // JIT provision user and create session
          const authService: AuthService = createAuthService(store.db ?? pgDb);
          const user = await authService.findOrCreateSamlUser(
            email,
            displayName,
            (parseResult.extract as SamlExtract).nameID || email,
            roleHint,
          );

          // CRIT-002 + Phase 17: issue a short-lived (60s) one-time code.
          // No session is created here — it is minted on-the-fly during the
          // backchannel code exchange so no raw token ever sits in Postgres.
          const code = await authService.createSamlHandoffCode(user.id);
          const callbackUrl = `${DASHBOARD_URL}/api/auth/saml-callback?code=${code}`;
          return redirect(callbackUrl);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[SAML] ACS error:", msg);
          return new Response("SAML authentication failed", { status: 401 });
        }
      })

      // -----------------------------------------------------------------------
      // GET /slo -- Single Logout
      // -----------------------------------------------------------------------
      .get("/slo", async (rawCtx) => {
        const { cookie, redirect } = rawCtx as {
          cookie: Record<string, { set: (opts: Record<string, unknown>) => void }>;
          redirect: (url: string) => Response;
        };

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
        const sloUrl = idpMeta?.getSingleLogoutService?.("redirect") || null;

        if (sloUrl && typeof sloUrl === "string") {
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
      })
  );
}
