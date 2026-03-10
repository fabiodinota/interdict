/**
 * Tests for POST /api/auth/login
 *
 * Validates API key login flow: input validation, control-plane verification,
 * and cookie security attributes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse, mockFetch } from "../helpers/next-mocks";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/auth", () => ({
  getControlPlaneUrl: vi.fn(() => "http://control-plane:3000"),
  SESSION_COOKIE_NAME: "interdict_session",
}));

import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(async () =>
      jsonResponse({ success: true, data: { id: "u1", displayName: "Admin", role: "admin" } })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when apiKey is missing", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("API key is required");
  });

  it("returns 400 when apiKey is not a string", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: 12345 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when control-plane rejects the key", async () => {
    fetchSpy = mockFetch(async () => new Response(null, { status: 403 }));

    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "bad-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid API key");
  });

  it("sets httpOnly session cookie on success", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "valid-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Check cookie header
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("interdict_session=valid-key");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });

  it("validates apiKey against control-plane /auth/me", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "my-key" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://control-plane:3000/api/v1/auth/me");
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer my-key" })
    );
  });

  it("returns 500 when fetch throws", async () => {
    fetchSpy = mockFetch(async () => {
      throw new Error("Network error");
    });

    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Login failed");
  });
});
