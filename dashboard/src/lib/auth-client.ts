/**
 * Client-safe auth utilities for SAML SSO.
 *
 * This module is safe to import from "use client" components.
 * It does NOT import next/headers (server-only).
 */

const COOKIE_NAME = "interdict_session";

function requirePublicApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is required for SAML auth flows");
  }
  return apiUrl;
}

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
  const apiUrl = requirePublicApiUrl();
  return `${apiUrl}/api/v1/auth/saml/sso`;
}

/**
 * Perform logout, clearing the session cookie.
 * If SAML is enabled, redirects to the control plane SLO endpoint
 * for IdP-initiated logout. Otherwise redirects to /login.
 */
export function logout(): void {
  if (isSamlEnabled()) {
    const apiUrl = requirePublicApiUrl();
    window.location.href = `${apiUrl}/api/v1/auth/saml/slo`;
  } else {
    window.location.href = "/login";
  }
}
