/**
 * Tests for dashboard/src/proxy.ts (Next.js middleware)
 *
 * The proxy middleware:
 * 1. Generates a per-request CSP nonce and sets Content-Security-Policy header
 * 2. Propagates nonce via x-nonce request header for Server Components
 * 3. Enforces session-gating on all non-API routes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildNextRequest } from "./helpers/next-mocks";
import { proxy } from "@/proxy";

describe("Next.js proxy middleware", () => {
  // -----------------------------------------------------------------------
  // CSP nonce generation
  // -----------------------------------------------------------------------
  describe("CSP nonce", () => {
    it("sets Content-Security-Policy header on responses", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy");

      expect(csp).toBeTruthy();
      expect(csp).toContain("script-src");
      expect(csp).toContain("style-src");
    });

    it("includes nonce in script-src and style-src", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy")!;

      // Extract nonce from script-src
      const nonceMatch = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
      expect(nonceMatch).toBeTruthy();
      const nonce = nonceMatch![1];

      expect(csp).toContain(`'nonce-${nonce}'`);
      // Nonce appears in both script-src and style-src
      const scriptSrc = csp.split(";").find((d) => d.trimStart().startsWith("script-src"));
      const styleSrc = csp.split(";").find((d) => d.trimStart().startsWith("style-src"));
      expect(scriptSrc).toContain(`'nonce-${nonce}'`);
      expect(styleSrc).toContain(`'nonce-${nonce}'`);
    });

    it("includes 'strict-dynamic' in script-src", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy")!;
      const scriptSrc = csp.split(";").find((d) => d.trimStart().startsWith("script-src"));

      expect(scriptSrc).toContain("'strict-dynamic'");
    });

    it("does not include 'unsafe-inline' in production CSP script-src", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy")!;
      const scriptSrc = csp.split(";").find((d) => d.trimStart().startsWith("script-src"));

      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("does not include 'unsafe-inline' in production CSP style-src", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy")!;
      const styleSrc = csp.split(";").find((d) => d.trimStart().startsWith("style-src"));

      expect(styleSrc).not.toContain("'unsafe-inline'");
    });

    it("generates a unique nonce per request", () => {
      const req1 = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const req2 = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res1 = proxy(req1 as never);
      const res2 = proxy(req2 as never);

      const csp1 = res1.headers.get("Content-Security-Policy")!;
      const csp2 = res2.headers.get("Content-Security-Policy")!;
      const nonce1 = csp1.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      const nonce2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];

      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
    });

    it("sets CSP header on redirect responses too", () => {
      const req = buildNextRequest("http://localhost:3001/evidence");
      // No session → redirects to /login
      const res = proxy(req as never);

      expect(res.status).toBe(307);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    });

    it("sets CSP header on API route responses", () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = proxy(req as never);

      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Dev mode unsafe-eval
  // -----------------------------------------------------------------------
  describe("dev mode", () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    afterEach(() => {
      vi.stubEnv("NODE_ENV", originalEnv ?? "test");
    });

    it("includes 'unsafe-eval' in script-src in development", () => {
      const req = buildNextRequest("http://localhost:3001/", {
        cookies: { interdict_session: "valid-token" },
      });
      const res = proxy(req as never);
      const csp = res.headers.get("Content-Security-Policy")!;
      const scriptSrc = csp.split(";").find((d) => d.trimStart().startsWith("script-src"));

      expect(scriptSrc).toContain("'unsafe-eval'");
    });
  });

  // -----------------------------------------------------------------------
  // API route passthrough
  // -----------------------------------------------------------------------
  describe("API routes", () => {
    it("allows API routes through without session", () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = proxy(req as never);

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
