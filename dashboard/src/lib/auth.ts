import { cookies } from "next/headers";

const COOKIE_NAME = "interdict_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface ParsedLoginRequest {
  apiKey: string;
}

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
export const SESSION_COOKIE_MAX_AGE = SESSION_COOKIE_MAX_AGE_SECONDS;

export async function parseLoginRequest(
  request: Request,
): Promise<
  { success: true; data: ParsedLoginRequest } | { success: false; error: { message: string } }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { success: false, error: { message: "Malformed request body" } };
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { apiKey?: unknown }).apiKey !== "string"
  ) {
    return { success: false, error: { message: "API key is required" } };
  }

  const apiKey = (body as { apiKey: string }).apiKey.trim();
  if (!apiKey) {
    return { success: false, error: { message: "API key is required" } };
  }

  return { success: true, data: { apiKey } };
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  };
}

export function getClearedSessionCookieOptions() {
  return {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
}
