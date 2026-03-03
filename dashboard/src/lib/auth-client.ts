/**
 * Client-safe auth utilities for SAML SSO.
 *
 * This module is safe to import from "use client" components.
 * It does NOT import next/headers (server-only).
 */

const COOKIE_NAME = "interdict_session";

/**
 * Check if SAML SSO is enabled via environment variable.
 * Safe to call from client components (uses NEXT_PUBLIC_ prefix).
 */
export function isSamlEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SAML_ENABLED === "true";
}

/**
 * Get the SSO initiation URL on the control plane.
 * The browser navigates here directly (full page redirect, not fetch).
 */
export function getSsoUrl(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  return `${apiUrl}/api/v1/auth/saml/sso`;
}

/**
 * Perform logout, clearing the session cookie.
 * If SAML is enabled, redirects to the control plane SLO endpoint
 * for IdP-initiated logout. Otherwise redirects to /login.
 */
export function logout(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;

  if (isSamlEnabled()) {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    window.location.href = `${apiUrl}/api/v1/auth/saml/slo`;
  } else {
    window.location.href = "/login";
  }
}
