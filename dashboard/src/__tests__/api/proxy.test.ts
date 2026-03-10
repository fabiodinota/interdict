/**
 * Tests for the BFF proxy route: dashboard/src/app/api/proxy/[...path]/route.ts
 *
 * The proxy is the single gateway between the dashboard and the control plane.
 * Every trust-sensitive data flow passes through here, making it one of the
 * highest-value test targets in the dashboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildNextRequest, jsonResponse, mockFetch } from "../helpers/next-mocks";

// ---------------------------------------------------------------------------
// Module mocks — must be at top level
// ---------------------------------------------------------------------------

let mockToken: string | null = "test-session-token";

vi.mock("@/lib/auth", () => ({
  getSessionToken: vi.fn(async () => mockToken),
  getControlPlaneUrl: vi.fn(() => "http://control-plane:3000"),
  SESSION_COOKIE_NAME: "interdict_session",
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------
import { GET, POST, PUT, DELETE } from "@/app/api/proxy/[...path]/route";

function makeParams(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

describe("BFF Proxy Route", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    mockToken = "test-session-token";
    fetchSpy = mockFetch(async () => jsonResponse({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------
  describe("auth guard", () => {
    it("returns 401 when no session token", async () => {
      mockToken = null;
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = await GET(req as never, makeParams(["policies"]));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.message).toBe("Not authenticated");
      // fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("attaches Bearer token to upstream request", async () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      await GET(req as never, makeParams(["policies"]));

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, init] = fetchSpy.mock.calls[0];
      expect((init as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: "Bearer test-session-token" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // URL construction
  // -----------------------------------------------------------------------
  describe("URL construction", () => {
    it("builds correct upstream URL from path segments", async () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/evidence/verify");
      await GET(req as never, makeParams(["evidence", "verify"]));

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://control-plane:3000/api/v1/evidence/verify");
    });

    it("forwards query parameters", async () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies?page=2&limit=10");
      await GET(req as never, makeParams(["policies"]));

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://control-plane:3000/api/v1/policies?page=2&limit=10");
    });

    it("omits ? when no query params present", async () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/vendors");
      await GET(req as never, makeParams(["vendors"]));

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://control-plane:3000/api/v1/vendors");
    });
  });

  // -----------------------------------------------------------------------
  // HTTP method forwarding
  // -----------------------------------------------------------------------
  describe("method forwarding", () => {
    it("forwards POST body with Content-Type", async () => {
      const body = JSON.stringify({ name: "new-policy" });
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });
      await POST(req as never, makeParams(["policies"]));

      const [, init] = fetchSpy.mock.calls[0];
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).body).toBe(body);
    });

    it("does not forward body for GET requests", async () => {
      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      await GET(req as never, makeParams(["policies"]));

      const [, init] = fetchSpy.mock.calls[0];
      expect((init as RequestInit).body).toBeUndefined();
    });

    it("exports PUT and DELETE handlers", () => {
      expect(PUT).toBeDefined();
      expect(DELETE).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // SSE streaming branch
  // -----------------------------------------------------------------------
  describe("SSE streaming", () => {
    it("returns streaming response for audit/stream path", async () => {
      const stream = new ReadableStream();
      fetchSpy = mockFetch(async () =>
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );

      const req = buildNextRequest("http://localhost:3001/api/proxy/audit/stream");
      const res = await GET(req as never, makeParams(["audit", "stream"]));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("returns upstream error status for failed SSE", async () => {
      fetchSpy = mockFetch(async () =>
        new Response(null, { status: 503 })
      );

      const req = buildNextRequest("http://localhost:3001/api/proxy/audit/stream");
      const res = await GET(req as never, makeParams(["audit", "stream"]));

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.message).toContain("Upstream error");
    });

    it("returns 502 when SSE connection fails entirely", async () => {
      fetchSpy = mockFetch(async () => {
        throw new Error("Connection refused");
      });

      const req = buildNextRequest("http://localhost:3001/api/proxy/audit/stream");
      const res = await GET(req as never, makeParams(["audit", "stream"]));

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toBe("Stream connection failed");
    });
  });

  // -----------------------------------------------------------------------
  // Response handling
  // -----------------------------------------------------------------------
  describe("response handling", () => {
    it("returns JSON responses transparently", async () => {
      const data = { success: true, data: { policies: [] } };
      fetchSpy = mockFetch(async () => jsonResponse(data, 200));

      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = await GET(req as never, makeParams(["policies"]));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(data);
    });

    it("preserves upstream error status codes", async () => {
      fetchSpy = mockFetch(async () => jsonResponse({ error: "not found" }, 404));

      const req = buildNextRequest("http://localhost:3001/api/proxy/policies/999");
      const res = await GET(req as never, makeParams(["policies", "999"]));

      expect(res.status).toBe(404);
    });

    it("passes through binary responses with correct headers", async () => {
      const pdfBody = new ReadableStream();
      fetchSpy = mockFetch(async () =>
        new Response(pdfBody, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=report.pdf",
            "Content-Length": "12345",
          },
        })
      );

      const req = buildNextRequest("http://localhost:3001/api/proxy/reports/download");
      const res = await GET(req as never, makeParams(["reports", "download"]));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toBe("attachment; filename=report.pdf");
      expect(res.headers.get("Content-Length")).toBe("12345");
    });

    it("returns 502 when upstream is unreachable", async () => {
      fetchSpy = mockFetch(async () => {
        throw new Error("ECONNREFUSED");
      });

      const req = buildNextRequest("http://localhost:3001/api/proxy/policies");
      const res = await GET(req as never, makeParams(["policies"]));

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toBe("Proxy request failed");
    });

    it("returns 502 when upstream response body is null for non-JSON", async () => {
      fetchSpy = mockFetch(async () =>
        new Response(null, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        })
      );

      const req = buildNextRequest("http://localhost:3001/api/proxy/reports/download");
      const res = await GET(req as never, makeParams(["reports", "download"]));

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toBe("Empty upstream response body");
    });
  });
});
