import { cookies } from "next/headers";

const COOKIE_NAME = "interdict_session";

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export function getControlPlaneUrl(): string {
  return process.env.CONTROL_PLANE_URL || "http://localhost:3000";
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
