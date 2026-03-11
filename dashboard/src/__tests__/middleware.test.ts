/**
 * Tests for dashboard/src/proxy.ts
 *
 * The middleware enforces session-gating on all non-API routes.
 * It redirects unauthenticated users to /login and prevents
 * authenticated users from accessing /login.
 */
import { describe, it, expect } from "vitest";
import { proxy } from "@/proxy";
import { buildNextRequest } from "./helpers/next-mocks";

describe("Next.js proxy", () => {
  // -----------------------------------------------------------------------
  // API route passthrough
  // -----------------------------------------------------------------------
  describe("API routes", () => {
    it("allows API routes through without session", () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = proxy(req as never);

      // NextResponse.next() does not set a Location header
      expect(res.headers.get("location")).toBeNull();
    });

    it("allows /api/auth routes through without session", () => {
      const req = buildNextRequest("http://localhost:3001/api/auth/login");
      const res = proxy(req as never);

      expect(res.headers.get("location")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Unauthenticated redirects
  // -----------------------------------------------------------------------
  describe("unauthenticated", () => {
    it("redirects to /login when no session cookie", () => {
      const req = buildNextRequest("http://localhost:3001/evidence");
      const res = proxy(req as never);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/login");
    });

    it("allows /login page without session", () => {
      const req = buildNextRequest("http://localhost:3001/login");
      const res = proxy(req as never);

      expect(res.headers.get("location")).toBeNull();
    });

    it("redirects dashboard root to /login without session", () => {
      const req = buildNextRequest("http://localhost:3001/");
      const res = proxy(req as never);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/login");
    });
  });

  // -----------------------------------------------------------------------
  // Authenticated redirects
  // -----------------------------------------------------------------------
  describe("authenticated", () => {
    it("redirects /login to / when session exists", () => {
      const req = buildNextRequest("http://localhost:3001/login", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(new URL(location).pathname).toBe("/");
    });

    it("allows dashboard pages when session exists", () => {
      const req = buildNextRequest("http://localhost:3001/evidence", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);

      expect(res.headers.get("location")).toBeNull();
    });

    it("allows nested routes when session exists", () => {
      const req = buildNextRequest("http://localhost:3001/policies/new", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);

      expect(res.headers.get("location")).toBeNull();
    });
  });
});
