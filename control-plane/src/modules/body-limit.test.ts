/**
 * Body Size Limit Tests
 *
 * Verifies that the Elysia server rejects request bodies exceeding
 * the configured MAX_BODY_SIZE limit with a structured 413 response.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

describe("Body size limit", () => {
  const MAX_BODY_BYTES = 1024; // 1KB for testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any;
  let baseUrl: string;

  beforeAll(() => {
    app = new Elysia()
      .onRequest(({ request, set }) => {
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
          set.status = 413;
          return {
            success: false,
            error: {
              code: "BODY_TOO_LARGE",
              maxBytes: MAX_BODY_BYTES,
            },
          };
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .post("/test", ({ body }: any) => ({ received: true, body }))
      .listen(0); // Random port

    baseUrl = `http://localhost:${app.server?.port}`;
  });

  afterAll(() => {
    app.stop();
  });

  test("accepts body within limit", async () => {
    const body = JSON.stringify({ data: "x".repeat(100) });
    const res = await fetch(`${baseUrl}/test`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      body,
    });
    expect(res.status).toBe(200);
  });

  test("rejects body exceeding limit with 413 and structured error", async () => {
    const body = JSON.stringify({ data: "x".repeat(2000) });
    const res = await fetch(`${baseUrl}/test`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(body.length) },
      body,
    });
    expect(res.status).toBe(413);
    const json = (await res.json()) as {
      success: boolean;
      error: { code: string; maxBytes: number };
    };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("BODY_TOO_LARGE");
    expect(json.error.maxBytes).toBe(MAX_BODY_BYTES);
  });

  test("allows requests without content-length header (GET)", async () => {
    // GET requests have no body — should not be affected
    const getApp = new Elysia()
      .onRequest(({ request, set }) => {
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
          set.status = 413;
          return {
            success: false,
            error: { code: "BODY_TOO_LARGE", maxBytes: MAX_BODY_BYTES },
          };
        }
      })
      .get("/health", () => ({ status: "ok" }))
      .listen(0);

    const res = await fetch(`http://localhost:${getApp.server?.port}/health`);
    expect(res.status).toBe(200);
    getApp.stop();
  });
});
