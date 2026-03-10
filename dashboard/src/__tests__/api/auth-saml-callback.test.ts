/**
 * Tests for GET /api/auth/saml-callback
 *
 * Validates CRIT-002 compliance: the raw session token never appears in
 * a redirect URL. Instead, an opaque one-time code is exchanged via
 * backchannel POST, and the resulting token is stored in an httpOnly cookie.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildNextRequest, jsonResponse, mockFetch } from "../helpers/next-mocks";

vi.mock("@/lib/auth", () => ({
  getControlPlaneUrl: vi.fn(() => "http://control-plane:3000"),
  SESSION_COOKIE_NAME: "interdict_session",
}));

import { GET } from "@/app/api/auth/saml-callback/route";

describe("GET /api/auth/saml-callback", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(async () =>
      jsonResponse({ success: true, data: { token: "session-jwt-abc" } })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /login?error=missing_code when code param absent", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?error=missing_code");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("exchanges code via backchannel POST (CRIT-002)", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=one-time-xyz");
    await GET(req as never);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://control-plane:3000/api/v1/auth/saml/exchange-code");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.code).toBe("one-time-xyz");
  });

  it("sets httpOnly cookie and redirects to / on success", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=valid-code");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/"); // redirects to home

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("interdict_session=session-jwt-abc");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });

  it("redirects to /login?error=code_expired when exchange returns non-ok", async () => {
    fetchSpy = mockFetch(async () => new Response(null, { status: 410 }));

    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=expired-code");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?error=code_expired");
  });

  it("redirects to /login?error=code_expired when response has no token", async () => {
    fetchSpy = mockFetch(async () =>
      jsonResponse({ success: false })
    );

    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=bad");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?error=code_expired");
  });

  it("redirects to /login?error=auth_error when fetch throws", async () => {
    fetchSpy = mockFetch(async () => {
      throw new Error("Network failure");
    });

    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=c");
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login?error=auth_error");
  });

  it("never exposes the session token in the redirect URL (CRIT-002)", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/saml-callback?code=valid");
    const res = await GET(req as never);

    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("session-jwt-abc");
    expect(location).not.toContain("token=");
  });
});
