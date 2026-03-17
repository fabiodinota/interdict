/**
 * Auth Middleware Tests
 *
 * Tests bearer token extraction, dual-mode routing (API key vs session token),
 * and role-based rejection. Uses mock Elysia context objects.
 *
 * Note: The authPlugin uses Elysia macro/resolve pattern which requires an Elysia
 * app context. We test the behavioral contract by constructing the plugin and
 * exercising it via a lightweight Elysia test app.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// We mock the DB and auth service to test middleware logic in isolation.
// The middleware imports db from ../../db/postgres and creates an authService,
// so we mock those modules.
// ---------------------------------------------------------------------------

const mockAuthenticateByApiKey = mock(
  async (_token: string) => null as { id: string; role: string; orgId: string } | null,
);
const mockAuthenticateBySessionToken = mock(
  async (_token: string) => null as { id: string; role: string; orgId: string } | null,
);

const _dbMod = mock.module("../../db/postgres", () => ({
  db: {},
}));

const _serviceMod = mock.module("./service", () => ({
  createAuthService: () => ({
    authenticateByApiKey: mockAuthenticateByApiKey,
    authenticateBySessionToken: mockAuthenticateBySessionToken,
    exchangeApiKeyForSession: mock(() => null),
    createSession: mock(() => "mock-session"),
    revokeSession: mock(() => {}),
    whoAmI: mock(() => null),
    createApiKey: mock(() => ({
      plaintext: "",
      keyId: "",
      prefix: "",
      label: null,
      createdAt: new Date(),
    })),
    revokeApiKey: mock(() => {}),
    listApiKeys: mock(() => ({ items: [], nextCursor: null })),
    findOrCreateSamlUser: mock(() => null),
    createSamlHandoffCode: mock(() => ""),
    exchangeSamlHandoffCode: mock(() => null),
  }),
}));

// Restore module mocks after all tests in this file
afterAll(() => {
  mock.restore();
});

// Import Elysia and middleware after mocking
const { Elysia } = await import("elysia");
const { authPlugin } = await import("./middleware");

// ---------------------------------------------------------------------------
// Test helper: create a minimal Elysia app with the auth plugin
// ---------------------------------------------------------------------------

function createTestApp(authOption: boolean | string[] = true) {
  return (
    new Elysia()
      .use(authPlugin)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .get(
        "/protected",
        (({ user }: { user: unknown }) => ({ user })) as any,
        {
          auth: authOption as unknown as boolean,
        } as Record<string, unknown>,
      )
      .get("/public", () => ({ ok: true }))
  );
}

describe("authPlugin", () => {
  beforeEach(() => {
    mockAuthenticateByApiKey.mockReset();
    mockAuthenticateBySessionToken.mockReset();
    mockAuthenticateByApiKey.mockImplementation(async () => null);
    mockAuthenticateBySessionToken.mockImplementation(async () => null);
  });

  // -----------------------------------------------------------------------
  // Bearer token extraction
  // -----------------------------------------------------------------------
  describe("bearer token extraction", () => {
    it("rejects request with no Authorization header", async () => {
      const app = createTestApp();

      const res = await app.handle(new Request("http://localhost/protected"));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects request with non-Bearer Authorization header", async () => {
      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Basic dXNlcjpwYXNz" },
        }),
      );

      expect(res.status).toBe(401);
    });

    it("rejects request with empty Bearer token", async () => {
      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer " },
        }),
      );

      // Empty token after "Bearer " should fail auth
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Dual-mode routing: API key vs session token
  // -----------------------------------------------------------------------
  describe("dual-mode routing", () => {
    it("routes ik_live_ prefixed tokens to API key authentication", async () => {
      const mockUser = { id: "u1", role: "super_admin", orgId: "org1" };
      mockAuthenticateByApiKey.mockImplementation(async () => mockUser);

      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer ik_live_test123" },
        }),
      );

      expect(res.status).toBe(200);
      expect(mockAuthenticateByApiKey).toHaveBeenCalledTimes(1);
      expect(mockAuthenticateBySessionToken).not.toHaveBeenCalled();
    });

    it("routes non-prefixed tokens to session token authentication", async () => {
      const mockUser = { id: "u2", role: "super_admin", orgId: "org1" };
      mockAuthenticateBySessionToken.mockImplementation(async () => mockUser);

      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer abc123sessiontoken" },
        }),
      );

      expect(res.status).toBe(200);
      expect(mockAuthenticateBySessionToken).toHaveBeenCalledTimes(1);
      expect(mockAuthenticateByApiKey).not.toHaveBeenCalled();
    });

    it("rejects when API key auth returns null", async () => {
      mockAuthenticateByApiKey.mockImplementation(async () => null);

      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer ik_live_invalid" },
        }),
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain("Invalid or expired");
    });

    it("rejects when session token auth returns null", async () => {
      mockAuthenticateBySessionToken.mockImplementation(async () => null);

      const app = createTestApp();

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer invalid_session" },
        }),
      );

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Role check
  // -----------------------------------------------------------------------
  describe("role-based access control", () => {
    it("allows super_admin to access policy_admin route", async () => {
      const mockUser = { id: "u3", role: "super_admin", orgId: "org1" };
      mockAuthenticateByApiKey.mockImplementation(async () => mockUser);

      const app = createTestApp(["policy_admin"]);

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer ik_live_admin" },
        }),
      );

      expect(res.status).toBe(200);
    });

    it("rejects read_only_auditor from policy_admin route", async () => {
      const mockUser = { id: "u4", role: "read_only_auditor", orgId: "org1" };
      mockAuthenticateByApiKey.mockImplementation(async () => mockUser);

      const app = createTestApp(["policy_admin"]);

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer ik_live_auditor" },
        }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("allows any authenticated user when auth is true (no roles)", async () => {
      const mockUser = { id: "u5", role: "read_only_auditor", orgId: "org1" };
      mockAuthenticateByApiKey.mockImplementation(async () => mockUser);

      const app = createTestApp(true);

      const res = await app.handle(
        new Request("http://localhost/protected", {
          headers: { Authorization: "Bearer ik_live_any" },
        }),
      );

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Public routes
  // -----------------------------------------------------------------------
  describe("public routes", () => {
    it("does not require auth for unprotected routes", async () => {
      const app = createTestApp();

      const res = await app.handle(new Request("http://localhost/public"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });
});
