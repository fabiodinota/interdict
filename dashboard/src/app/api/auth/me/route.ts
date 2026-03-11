import { NextResponse } from "next/server";
import { getSessionToken, getControlPlaneUrl } from "@/lib/auth";

export async function GET() {
  const token = await getSessionToken();

  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: "Not authenticated" } },
      { status: 401 },
    );
  }

  try {
    const controlPlaneUrl = getControlPlaneUrl();
    const res = await fetch(`${controlPlaneUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: { message: "Session expired" } },
        { status: 401 },
      );
    }

    const userData = await res.json();
    return NextResponse.json({ success: true, data: userData.data });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Failed to fetch user" } },
      { status: 500 },
    );
  }
}
