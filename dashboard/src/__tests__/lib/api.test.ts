/**
 * Tests for dashboard/src/lib/api.ts
 *
 * The `api()` function is the centralized fetch wrapper used by every
 * React Query hook. All calls go through the BFF proxy (/api/proxy/...),
 * NOT directly to the control plane.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "@/lib/api";
import { mockFetch, jsonResponse } from "../helpers/next-mocks";

describe("api() fetch wrapper", () => {
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch(async () => jsonResponse({ data: "ok" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes path with /api/proxy", async () => {
    await api("/policies");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/proxy/policies");
  });

  it("sets Content-Type: application/json by default", async () => {
    await api("/policies");

    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ "Content-Type": "application/json" }),
    );
  });

  it("returns parsed JSON on success", async () => {
    fetchSpy = mockFetch(async () => jsonResponse({ data: { policies: [{ id: "p1" }] } }));

    const result = await api<{ data: { policies: { id: string }[] } }>("/policies");
    expect(result.data.policies[0].id).toBe("p1");
  });

  it("throws ApiError with status and message on non-ok response", async () => {
    fetchSpy = mockFetch(async () =>
      jsonResponse({ error: { message: "Not found", code: "POLICY_NOT_FOUND" } }, 404),
    );

    await expect(api("/policies/999")).rejects.toThrow(ApiError);

    try {
      await api("/policies/999");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.message).toBe("Not found");
      expect(apiErr.code).toBe("POLICY_NOT_FOUND");
      expect(apiErr.name).toBe("ApiError");
    }
  });

  it("handles non-JSON error responses gracefully", async () => {
    fetchSpy = mockFetch(
      async () =>
        new Response("Internal Server Error", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    try {
      await api("/broken");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      // Falls back to statusText when JSON parsing fails
      expect(apiErr.message).toBeTruthy();
    }
  });

  it("forwards custom headers and options", async () => {
    await api("/evidence/verify", {
      method: "POST",
      body: JSON.stringify({ bundle_ids: ["b1"] }),
      headers: { "X-Custom": "value" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-Custom": "value",
      }),
    );
  });
});
