/**
 * Tests for POST /api/auth/login.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../helpers/next-mocks";
import { POST } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "http://control-plane:3000";
    fetchSpy = mockFetch(async () =>
      jsonResponse({
        success: true,
        data: {
          token: "session_opaque_token",
          user: { id: "u1", displayName: "Admin", role: "admin" },
        },
      }),
    );
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    vi.restoreAllMocks();
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Malformed request body");
    expect(fetchSpy).not.toHaveBeenCalled();
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
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when apiKey is not a string", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: 12345 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when control-plane rejects the key", async () => {
    fetchSpy = mockFetch(async () => new Response(null, { status: 401 }));

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

  it("sets an opaque httpOnly session cookie on success", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "ik_live_valid-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("interdict_session=session_opaque_token");
    expect(setCookie).not.toContain("ik_live_valid-key");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });

  it("exchanges the api key through the control-plane session endpoint", async () => {
    const req = new Request("http://localhost:3001/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ apiKey: "ik_live_my-key" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(req);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://control-plane:3000/api/v1/auth/session/exchange-api-key");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ apiKey: "ik_live_my-key" });
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
