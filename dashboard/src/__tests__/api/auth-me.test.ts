/**
 * Tests for GET /api/auth/me
 *
 * Validates session check: returns 401 when unauthenticated, proxies user data
 * when session is valid, handles control-plane failures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse, mockFetch } from "../helpers/next-mocks";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
let mockToken: string | null = "valid-token";

vi.mock("@/lib/auth", () => ({
  getSessionToken: vi.fn(async () => mockToken),
  getControlPlaneUrl: vi.fn(() => "http://control-plane:3000"),
}));

import { GET } from "@/app/api/auth/me/route";

describe("GET /api/auth/me", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    mockToken = "valid-token";
    fetchSpy = mockFetch(async () =>
      jsonResponse({ success: true, data: { id: "u1", displayName: "Admin" } })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no session token exists", async () => {
    mockToken = null;
    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Not authenticated");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns user data when session is valid", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: "u1", displayName: "Admin" });
  });

  it("returns 401 when control-plane rejects the token (session expired)", async () => {
    fetchSpy = mockFetch(async () => new Response(null, { status: 401 }));
    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Session expired");
  });

  it("returns 500 when control-plane is unreachable", async () => {
    fetchSpy = mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Failed to fetch user");
  });

  it("sends Bearer token to control-plane", async () => {
    await GET();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://control-plane:3000/api/v1/auth/me");
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer valid-token" })
    );
  });
});
