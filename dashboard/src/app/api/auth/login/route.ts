import { NextResponse } from "next/server";
import {
  getControlPlaneUrl,
  getSessionCookieOptions,
  parseLoginRequest,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export async function POST(request: Request) {
  const parsed = await parseLoginRequest(request);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  try {
    // Validate the key against the control plane
    const controlPlaneUrl = getControlPlaneUrl();
    const res = await fetch(`${controlPlaneUrl}/api/v1/auth/session/exchange-api-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey: parsed.data.apiKey }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid API key" } },
        { status: 401 },
      );
    }

    const exchange = await res.json();
    const sessionToken = exchange?.data?.token;
    const user = exchange?.data?.user;

    if (typeof sessionToken !== "string" || !user) {
      throw new Error("Invalid exchange response");
    }

    const response = NextResponse.json({
      success: true,
      data: user,
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Login failed" } },
      { status: 500 },
    );
  }
}
