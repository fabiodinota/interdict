import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js proxy (middleware): per-request CSP nonce generation + session gating.
 *
 * - Generates a cryptographic nonce for each request
 * - Sets Content-Security-Policy with nonce-based script-src and style-src
 * - Propagates nonce via x-nonce request header for Server Components
 * - Redirects unauthenticated users to /login (except API routes)
 * - Redirects authenticated users away from /login
 */
export function proxy(request: NextRequest) {
  // --- Nonce generation ---
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // --- Build CSP directives ---
  const isDev = process.env.NODE_ENV === "development";

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  const styleSrc = ["'self'", `'nonce-${nonce}'`].join(" ");

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `font-src 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");

  // --- Session gating ---
  const session = request.cookies.get("interdict_session");
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // API routes pass through — only add CSP headers
  if (isApiRoute) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Unauthenticated non-login requests → redirect to /login
  if (!session && !isLoginPage) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Authenticated users on /login → redirect to /
  if (session && isLoginPage) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // --- Normal request: set nonce on request headers, CSP on response ---
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
