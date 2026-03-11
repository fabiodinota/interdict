/**
 * Shared helpers for mocking Next.js server primitives in vitest.
 *
 * Next.js route handlers use NextRequest/NextResponse from "next/server"
 * and cookies() from "next/headers". These helpers allow tests to call
 * route handlers directly without a running Next.js server.
 */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock cookie jar used by next/headers cookies()
// ---------------------------------------------------------------------------
export function createMockCookieStore(initial: Record<string, string> = {}): {
  get: (name: string) => { name: string; value: string } | undefined;
  getAll: () => { name: string; value: string }[];
  set: (...args: unknown[]) => void;
  delete: (name: string) => void;
  _jar: Map<string, string>;
} {
  const jar = new Map(Object.entries(initial));
  return {
    get(name: string) {
      const v = jar.get(name);
      return v !== undefined ? { name, value: v } : undefined;
    },
    getAll() {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
    set(...args: unknown[]) {
      if (typeof args[0] === "string") {
        jar.set(args[0], String(args[1]));
      }
    },
    delete(name: string) {
      jar.delete(name);
    },
    _jar: jar,
  };
}

// ---------------------------------------------------------------------------
// Build a NextRequest-like object for testing route handlers
// ---------------------------------------------------------------------------
export function buildNextRequest(
  url: string,
  init: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): Request & {
  nextUrl: URL;
  cookies: ReturnType<typeof createMockCookieStore>;
} {
  const nextUrl = new URL(url, "http://localhost:3001");
  const request = new Request(nextUrl.toString(), {
    method: init.method ?? "GET",
    body: init.body,
    headers: init.headers,
  });

  // Attach Next.js-specific properties
  const cookieStore = createMockCookieStore(init.cookies ?? {});
  Object.defineProperty(request, "nextUrl", { value: nextUrl, writable: false });
  Object.defineProperty(request, "cookies", { value: cookieStore, writable: false });

  return request as Request & {
    nextUrl: URL;
    cookies: ReturnType<typeof createMockCookieStore>;
  };
}

// ---------------------------------------------------------------------------
// Setup vi.mock for next/headers so getSessionToken() works
// ---------------------------------------------------------------------------
export function mockNextHeadersCookies(jar: Record<string, string>) {
  const store = createMockCookieStore(jar);
  vi.mock("next/headers", () => ({
    cookies: vi.fn(async () => store),
  }));
  return store;
}

// ---------------------------------------------------------------------------
// Mock global fetch with a configurable response factory
// ---------------------------------------------------------------------------
export function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(handler);
  vi.stubGlobal("fetch", spy);
  return spy;
}

/**
 * Create a simple Response for mocking upstream calls.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
