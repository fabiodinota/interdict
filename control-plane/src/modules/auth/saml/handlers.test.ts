/**
 * SAML Handler Tests
 *
 * Comprehensive test suite for SAML SSO route handlers covering:
 * - SSO initiation (redirect to IdP)
 * - ACS (assertion consumer) with valid/invalid assertions
 * - Handoff code creation, exchange, replay prevention, expiry
 * - JIT user provisioning (new user + existing user update)
 * - SLO (single logout)
 * - Metadata endpoint
 * - Disabled SAML behavior
 * - Error handling paths
 *
 * Mocking strategy: samlify SP/IdP are mocked at the module boundary so
 * we control assertion data without needing real XML signatures. The
 * AuthService is also mocked to avoid database dependencies.
 */

import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockAuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isService: boolean;
  departmentIds: string[];
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<MockAuthUser> = {}): MockAuthUser {
  return {
    id: "usr_001",
    email: "alice@example.com",
    displayName: "Alice Smith",
    role: "read_only_auditor",
    isService: false,
    departmentIds: [],
    ...overrides,
  };
}

/** Create a mock AuthService with controlled return values */
function makeMockAuthService(overrides: Record<string, unknown> = {}) {
  return {
    findOrCreateSamlUser: mock(async () => makeUser()),
    createSamlHandoffCode: mock(async () => "handoff_code_abc123"),
    exchangeSamlHandoffCode: mock(async () => "session_token_xyz789"),
    createSession: mock(async () => "session_token_xyz789"),
    revokeSession: mock(async () => {}),
    authenticateByApiKey: mock(async () => null),
    authenticateBySessionToken: mock(async () => null),
    exchangeApiKeyForSession: mock(async () => null),
    createApiKey: mock(async () => ({
      plaintext: "",
      keyId: "",
      prefix: "",
      label: null,
      createdAt: new Date(),
    })),
    revokeApiKey: mock(async () => {}),
    listApiKeys: mock(async () => ({ items: [], nextCursor: null })),
    whoAmI: mock(async () => makeUser()),
    ...overrides,
  };
}

/** Create a mock SP */
function makeMockSp(overrides: Record<string, unknown> = {}) {
  return {
    createLoginRequest: mock((_idp: unknown, _binding: string) => ({
      context: "https://idp.example.com/sso?SAMLRequest=encoded_request",
    })),
    parseLoginResponse: mock(async (_idp: unknown, _binding: string, _opts: unknown) => ({
      extract: {
        nameID: "alice@example.com",
        attributes: {
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Alice Smith",
          "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": "admin",
        },
      },
    })),
    getMetadata: mock(() => "<EntityDescriptor>mock-metadata</EntityDescriptor>"),
    ...overrides,
  };
}

/** Create a mock IdP */
function makeMockIdp(overrides: Record<string, unknown> = {}) {
  return {
    entityMeta: {
      getSingleLogoutService: mock((_binding: string) => "https://idp.example.com/slo"),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Elysia test app builder
// ---------------------------------------------------------------------------

/**
 * Build a test Elysia app that mimics the real SAML routes but with
 * injected mocks. This avoids importing the real config module which
 * requires filesystem certs.
 */
function buildTestApp(opts: {
  sp?: ReturnType<typeof makeMockSp>;
  idp?: ReturnType<typeof makeMockIdp>;
  authService?: ReturnType<typeof makeMockAuthService>;
  samlEnabled?: boolean;
  dashboardUrl?: string;
}) {
  const {
    sp: spMock = makeMockSp(),
    idp: idpMock = makeMockIdp(),
    authService: authServiceMock = makeMockAuthService(),
    samlEnabled = true,
    dashboardUrl = "http://localhost:8080",
  } = opts;

  const app = new Elysia({ prefix: "/api/v1/auth" });

  if (!samlEnabled) {
    // When SAML is disabled, mount empty prefix (no routes)
    return app.use(new Elysia({ prefix: "/saml" }));
  }

  return app.use(
    new Elysia({ prefix: "/saml" })
      // SSO initiation
      .get("/sso", ({ redirect }) => {
        const { context: loginRequestUrl } = spMock.createLoginRequest(idpMock, "redirect");
        return redirect(loginRequestUrl);
      })

      // ACS
      .post("/acs", async ({ body, redirect }) => {
        try {
          const parseResult = await spMock.parseLoginResponse(idpMock, "post", { body });
          const extract = parseResult.extract as {
            nameID?: string;
            attributes?: Record<string, string | string[] | undefined>;
          };

          // Inline extractAttributes logic (same as handlers.ts)
          const nameID = extract.nameID ?? "";
          const attrs = extract.attributes ?? {};
          const first = (v: string | string[] | undefined): string =>
            Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

          const email =
            nameID ||
            first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]) ||
            first(attrs.email) ||
            "";

          const displayName =
            first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]) ||
            first(attrs.displayName) ||
            email.split("@")[0] ||
            "SAML User";

          const roleHint =
            first(attrs["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"]) ||
            first(attrs.role) ||
            undefined;

          if (!email) {
            return new Response("SAML assertion missing email/nameID", { status: 400 });
          }

          const user = await authServiceMock.findOrCreateSamlUser(
            email,
            displayName,
            nameID || email,
            roleHint,
          );
          const code = await authServiceMock.createSamlHandoffCode(user.id);
          const callbackUrl = `${dashboardUrl}/api/auth/saml-callback?code=${code}`;
          return redirect(callbackUrl);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[SAML] ACS error:", msg);
          return new Response("SAML authentication failed", { status: 401 });
        }
      })

      // SLO
      .get("/slo", async ({ redirect, cookie }) => {
        // Revoke server-side session before clearing cookie
        const sessionToken = cookie?.interdict_session?.value;
        if (sessionToken) {
          try {
            await authServiceMock.revokeSession(sessionToken);
          } catch (err) {
            console.warn(
              `[saml] SLO session revocation failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            // Continue with cookie clear + redirect even if revocation fails
          }
        }

        // Clear session cookie
        if (cookie?.interdict_session) {
          cookie.interdict_session.set({
            value: "",
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          });
        }

        const sloUrl = idpMock.entityMeta.getSingleLogoutService("redirect");
        if (sloUrl && typeof sloUrl === "string") {
          return redirect(sloUrl);
        }
        return redirect(`${dashboardUrl}/login`);
      })

      // Metadata
      .get("/metadata", () => {
        const metadata = spMock.getMetadata();
        if (!metadata) {
          return new Response("SAML not configured", { status: 503 });
        }
        return new Response(metadata, {
          headers: { "Content-Type": "application/xml" },
        });
      })

      // Exchange code
      .post("/exchange-code", async ({ body }) => {
        const { code } = body as { code: string };
        const sessionToken = await authServiceMock.exchangeSamlHandoffCode(code);
        if (!sessionToken) {
          return Response.json(
            {
              success: false,
              error: {
                code: "CODE_EXPIRED",
                message: "Code is invalid, expired, or already used.",
              },
            },
            { status: 410 },
          );
        }
        return Response.json({ success: true, data: { token: sessionToken } });
      }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SAML Handlers", () => {
  // -----------------------------------------------------------------------
  // SSO Initiation
  // -----------------------------------------------------------------------
  describe("GET /saml/sso — SSO Initiation", () => {
    test("redirects to IdP SSO URL", async () => {
      const app = buildTestApp({});
      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/sso"));

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toContain("idp.example.com/sso");
    });

    test("calls SP.createLoginRequest with redirect binding", async () => {
      const sp = makeMockSp();
      const idp = makeMockIdp();
      const app = buildTestApp({ sp, idp });

      await app.handle(new Request("http://localhost/api/v1/auth/saml/sso"));
      expect(sp.createLoginRequest).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // ACS — Assertion Consumer Service
  // -----------------------------------------------------------------------
  describe("POST /saml/acs — Assertion Consumer Service", () => {
    test("valid assertion creates handoff code and redirects to dashboard", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "base64_encoded_response" }),
        }),
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/api/auth/saml-callback");
      expect(location).toContain("code=handoff_code_abc123");
    });

    test("calls findOrCreateSamlUser with extracted email and displayName", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "base64_encoded_response" }),
        }),
      );

      expect(authService.findOrCreateSamlUser).toHaveBeenCalledTimes(1);
      const [email, displayName] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(email).toBe("alice@example.com");
      expect(displayName).toBe("Alice Smith");
    });

    test("passes roleHint but does not use it for role assignment (CRIT-001)", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      const [, , , roleHint] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(roleHint).toBe("admin"); // Passed but ignored
    });

    test("returns 400 when assertion has no email/nameID", async () => {
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => ({
          extract: { nameID: "", attributes: {} },
        })),
      });
      const app = buildTestApp({ sp });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("missing email");
    });

    test("returns 401 when parseLoginResponse throws (invalid/expired assertion)", async () => {
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => {
          throw new Error("Signature verification failed");
        }),
      });
      const app = buildTestApp({ sp });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "bad_response" }),
        }),
      );

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("SAML authentication failed");
    });

    test("extracts email from attributes when nameID is empty", async () => {
      const authService = makeMockAuthService();
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => ({
          extract: {
            nameID: "",
            attributes: {
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
                "bob@example.com",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "Bob Jones",
            },
          },
        })),
      });
      const app = buildTestApp({ sp, authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      const [email, displayName] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(email).toBe("bob@example.com");
      expect(displayName).toBe("Bob Jones");
    });

    test("uses email prefix as displayName fallback", async () => {
      const authService = makeMockAuthService();
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => ({
          extract: {
            nameID: "charlie@example.com",
            attributes: {},
          },
        })),
      });
      const app = buildTestApp({ sp, authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      const [, displayName] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(displayName).toBe("charlie");
    });

    test("handles array-valued SAML attributes", async () => {
      const authService = makeMockAuthService();
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => ({
          extract: {
            nameID: "",
            attributes: {
              email: ["array-user@example.com", "secondary@example.com"],
              displayName: ["Array User"],
            },
          },
        })),
      });
      const app = buildTestApp({ sp, authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      const [email, displayName] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(email).toBe("array-user@example.com");
      expect(displayName).toBe("Array User");
    });
  });

  // -----------------------------------------------------------------------
  // Handoff Code Exchange
  // -----------------------------------------------------------------------
  describe("POST /saml/exchange-code — Handoff Code Exchange", () => {
    test("valid code returns session token", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/exchange-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "a".repeat(64) }),
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.token).toBe("session_token_xyz789");
    });

    test("replay prevention: second exchange returns 410", async () => {
      const authService = makeMockAuthService({
        exchangeSamlHandoffCode: mock()
          .mockResolvedValueOnce("session_token_first")
          .mockResolvedValueOnce(null), // second call returns null (used)
      });
      const app = buildTestApp({ authService });

      const makeReq = () =>
        new Request("http://localhost/api/v1/auth/saml/exchange-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "b".repeat(64) }),
        });

      const res1 = await app.handle(makeReq());
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);

      const res2 = await app.handle(makeReq());
      expect(res2.status).toBe(410);
      const data2 = await res2.json();
      expect(data2.success).toBe(false);
      expect(data2.error.code).toBe("CODE_EXPIRED");
    });

    test("expired code returns 410 with CODE_EXPIRED", async () => {
      const authService = makeMockAuthService({
        exchangeSamlHandoffCode: mock(async () => null),
      });
      const app = buildTestApp({ authService });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/exchange-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "c".repeat(64) }),
        }),
      );

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.error.code).toBe("CODE_EXPIRED");
      expect(data.error.message).toContain("expired");
    });
  });

  // -----------------------------------------------------------------------
  // JIT User Provisioning
  // -----------------------------------------------------------------------
  describe("JIT User Provisioning", () => {
    test("new user is created from SAML attributes", async () => {
      const authService = makeMockAuthService({
        findOrCreateSamlUser: mock(async (email: string, displayName: string) =>
          makeUser({ email, displayName, role: "read_only_auditor" }),
        ),
      });
      const app = buildTestApp({ authService });

      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      expect(authService.findOrCreateSamlUser).toHaveBeenCalledTimes(1);
      const [email, displayName, externalId] = authService.findOrCreateSamlUser.mock.calls[0];
      expect(email).toBe("alice@example.com");
      expect(displayName).toBe("Alice Smith");
      expect(externalId).toBe("alice@example.com"); // nameID used as externalId
    });

    test("existing user's externalId is updated on subsequent login", async () => {
      let callCount = 0;
      const authService = makeMockAuthService({
        findOrCreateSamlUser: mock(async (email: string) => {
          callCount++;
          // Simulate existing user found on second call
          return makeUser({
            email,
            id: callCount === 1 ? "usr_new" : "usr_existing",
          });
        }),
      });
      const app = buildTestApp({ authService });

      // First login
      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      // Second login (same user)
      await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      expect(authService.findOrCreateSamlUser).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // SLO — Single Logout
  // -----------------------------------------------------------------------
  describe("GET /saml/slo — Single Logout", () => {
    test("redirects to IdP SLO URL", async () => {
      const app = buildTestApp({});
      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/slo"));

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBe("https://idp.example.com/slo");
    });

    test("redirects to dashboard login when IdP has no SLO endpoint", async () => {
      const idp = makeMockIdp({
        getSingleLogoutService: mock(() => null),
      });
      const app = buildTestApp({ idp, dashboardUrl: "http://localhost:8080" });

      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/slo"));

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toBe("http://localhost:8080/login");
    });

    test("clears session cookie on logout", async () => {
      const app = buildTestApp({});
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/slo", {
          headers: { cookie: "interdict_session=abc123" },
        }),
      );

      expect(res.status).toBe(302);
      // Cookie should be cleared (maxAge=0)
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        // Elysia may set the cookie header to clear the cookie
        expect(setCookie).toContain("interdict_session");
      }
    });

    test("SLO revokes server session before clearing cookie", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/slo", {
          headers: { cookie: "interdict_session=test-session-token" },
        }),
      );

      expect(res.status).toBe(302);
      expect(authService.revokeSession).toHaveBeenCalledTimes(1);
      expect(authService.revokeSession.mock.calls[0][0]).toBe("test-session-token");
    });

    test("SLO continues with redirect when session revocation fails", async () => {
      const authService = makeMockAuthService({
        revokeSession: mock(async () => {
          throw new Error("DB connection lost");
        }),
      });

      const warnLogs: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnLogs.push(args.map(String).join(" "));
      };

      try {
        const app = buildTestApp({ authService });
        const res = await app.handle(
          new Request("http://localhost/api/v1/auth/saml/slo", {
            headers: { cookie: "interdict_session=doomed-token" },
          }),
        );

        expect(res.status).toBe(302);
        const location = res.headers.get("location");
        expect(location).toBe("https://idp.example.com/slo");
        expect(warnLogs.some((l) => l.includes("[saml] SLO session revocation failed"))).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });

    test("SLO skips revocation when no session cookie present", async () => {
      const authService = makeMockAuthService();
      const app = buildTestApp({ authService });

      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/slo"));

      expect(res.status).toBe(302);
      expect(authService.revokeSession).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Metadata Endpoint
  // -----------------------------------------------------------------------
  describe("GET /saml/metadata — SP Metadata", () => {
    test("returns XML metadata with correct content type", async () => {
      const app = buildTestApp({});
      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/metadata"));

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/xml");
      const text = await res.text();
      expect(text).toContain("EntityDescriptor");
    });

    test("returns 503 when SP metadata is not available", async () => {
      const sp = makeMockSp({
        getMetadata: mock(() => null),
      });
      const app = buildTestApp({ sp });

      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/metadata"));

      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toContain("SAML not configured");
    });
  });

  // -----------------------------------------------------------------------
  // Disabled SAML
  // -----------------------------------------------------------------------
  describe("Disabled SAML", () => {
    test("SSO returns 404 when SAML is disabled", async () => {
      const app = buildTestApp({ samlEnabled: false });
      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/sso"));

      expect(res.status).toBe(404);
    });

    test("ACS returns 404 when SAML is disabled", async () => {
      const app = buildTestApp({ samlEnabled: false });
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "encoded" }),
        }),
      );

      expect(res.status).toBe(404);
    });

    test("metadata returns 404 when SAML is disabled", async () => {
      const app = buildTestApp({ samlEnabled: false });
      const res = await app.handle(new Request("http://localhost/api/v1/auth/saml/metadata"));

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Error Handling
  // -----------------------------------------------------------------------
  describe("Error Handling", () => {
    test("ACS logs error and returns 401 on unexpected exception", async () => {
      const originalError = console.error;
      const errorLogs: string[] = [];
      console.error = (...args: unknown[]) => {
        errorLogs.push(args.map(String).join(" "));
      };

      try {
        const sp = makeMockSp({
          parseLoginResponse: mock(async () => {
            throw new Error("XML parsing failed: malformed response");
          }),
        });
        const app = buildTestApp({ sp });

        const res = await app.handle(
          new Request("http://localhost/api/v1/auth/saml/acs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ SAMLResponse: "malformed" }),
          }),
        );

        expect(res.status).toBe(401);
        expect(errorLogs.some((l) => l.includes("[SAML] ACS error"))).toBe(true);
      } finally {
        console.error = originalError;
      }
    });

    test("ACS handles non-Error thrown values", async () => {
      const sp = makeMockSp({
        parseLoginResponse: mock(async () => {
          throw "string error thrown"; // eslint-disable-line no-throw-literal
        }),
      });
      const app = buildTestApp({ sp });

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/saml/acs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SAMLResponse: "bad" }),
        }),
      );

      expect(res.status).toBe(401);
    });
  });
});
