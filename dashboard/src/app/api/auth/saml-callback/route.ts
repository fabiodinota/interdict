import { NextRequest, NextResponse } from "next/server";
import { getControlPlaneUrl, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * GET /api/auth/saml-callback?code=<oneTimeCode>
 *
 * Receives a short-lived one-time code from the control-plane ACS handler.
 * Exchanges the code for a session token via a backchannel POST, then sets
 * the session cookie on the dashboard origin.
 *
 * CRIT-002 fix: the raw session token is no longer placed in the redirect URL.
 * Instead, an opaque code (60s TTL, single-use) is used and exchanged here.
 *
 * Architectural exception (NEW-BOUNDARY): This route calls control-plane directly
 * instead of routing through /api/proxy/, because it is part of session bootstrap —
 * the credential that the proxy would attach does not exist yet at this point in the
 * SAML flow. No user data is forwarded; only an opaque one-time code is exchanged.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  // Exchange the one-time code for a session token via backchannel POST
  let token: string;
  try {
    const controlPlaneUrl = getControlPlaneUrl();
    const res = await fetch(`${controlPlaneUrl}/api/v1/auth/saml/exchange-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/login?error=code_expired", request.url));
    }

    const json = await res.json() as { success: boolean; data?: { token: string } };
    if (!json.success || !json.data?.token) {
      return NextResponse.redirect(new URL("/login?error=code_expired", request.url));
    }

    token = json.data.token;
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_error", request.url));
  }

  // Set cookie on dashboard origin and redirect to home
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
