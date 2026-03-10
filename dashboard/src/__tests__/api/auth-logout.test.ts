/**
 * Tests for POST /api/auth/logout
 *
 * Validates HIGH-003 compliance: server-side session revocation happens
 * before cookie clearing. Cookie is always cleared even if revocation fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildNextRequest, jsonResponse, mockFetch } from "../helpers/next-mocks";

vi.mock("@/lib/auth", () => ({
  getControlPlaneUrl: vi.fn(() => "http://control-plane:3000"),
  SESSION_COOKIE_NAME: "interdict_session",
}));

import { POST } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(async () => jsonResponse({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revokes server-side session before clearing cookie (HIGH-003)", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/logout", {
      method: "POST",
      cookies: { interdict_session: "active-token" },
    });
    const res = await POST(req as never);

    // Should call control-plane logout
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://control-plane:3000/api/v1/auth/logout");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer active-token" })
    );

    // Cookie should be cleared
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("interdict_session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
  });

  it("clears cookie even when server revocation fails", async () => {
    fetchSpy = mockFetch(async () => {
      throw new Error("Connection refused");
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const req = buildNextRequest("http://localhost:3001/api/auth/logout", {
      method: "POST",
      cookies: { interdict_session: "orphan-token" },
    });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Cookie should still be cleared
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Max-Age=0");

    consoleErrorSpy.mockRestore();
  });

  it("succeeds without calling control-plane when no cookie present", async () => {
    const req = buildNextRequest("http://localhost:3001/api/auth/logout", {
      method: "POST",
    });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
