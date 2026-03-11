import { NextRequest, NextResponse } from "next/server";
import { getControlPlaneUrl, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * POST /api/auth/logout
 *
 * HIGH-003 fix: revokes the server-side session before clearing the cookie.
 * Without this, stolen tokens remained valid until natural expiry.
 *
 * Architectural exception (NEW-BOUNDARY): This route calls control-plane directly
 * instead of routing through /api/proxy/, because it is part of session teardown —
 * the bearer credential the proxy relies on is the same one being revoked here.
 * Routing through the proxy would create a circular dependency on the session.
 */
export async function POST(request: NextRequest) {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    try {
      await fetch(`${getControlPlaneUrl()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rawToken}` },
      });
    } catch (err) {
      // Log but don't block logout — cookie is cleared regardless
      console.error(
        "[logout] Failed to revoke server-side session:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
