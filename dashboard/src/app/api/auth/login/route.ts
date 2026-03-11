import { NextResponse } from "next/server";
import { getControlPlaneUrl, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { success: false, error: { message: "API key is required" } },
        { status: 400 },
      );
    }

    // Validate the key against the control plane
    const controlPlaneUrl = getControlPlaneUrl();
    const res = await fetch(`${controlPlaneUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid API key" } },
        { status: 401 },
      );
    }

    const userData = await res.json();

    // Set httpOnly session cookie
    const response = NextResponse.json({
      success: true,
      data: userData.data,
    });

    response.cookies.set(SESSION_COOKIE_NAME, apiKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Login failed" } },
      { status: 500 },
    );
  }
}
