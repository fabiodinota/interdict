import { cookies } from "next/headers";

const COOKIE_NAME = "interdict_session";

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export function getControlPlaneUrl(): string {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!controlPlaneUrl) {
    throw new Error("CONTROL_PLANE_URL or NEXT_PUBLIC_API_URL must be configured");
  }

  return controlPlaneUrl;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
