import { NextRequest, NextResponse } from "next/server";
import { getControlPlaneUrl, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * GET /api/auth/saml-callback?token=<sessionToken>
 *
 * Receives the session token from the control-plane ACS handler via redirect,
 * validates it, and sets the session cookie on the dashboard origin.
 *
 * This solves the cross-origin cookie problem: the control-plane (port 3000)
 * cannot set cookies visible to the dashboard (port 8080). Instead, it
 * redirects here with the token as a query parameter, and this route sets
 * the cookie on the correct origin.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  // Validate the token against the control plane
  try {
    const controlPlaneUrl = getControlPlaneUrl();
    const res = await fetch(`${controlPlaneUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/login?error=invalid_session", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_session", request.url));
  }

  // Token is valid -- set cookie on dashboard origin and redirect to home
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60, // 8 hours, matching session expiry
    path: "/",
  });

  return response;
}
