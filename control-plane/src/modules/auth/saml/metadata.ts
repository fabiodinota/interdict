/**
 * SAML SP Metadata Generator
 *
 * Returns the SP metadata XML for consumption by Identity Providers.
 * The metadata endpoint is unauthenticated so IdPs can fetch it directly.
 */

import { sp } from "./config";

/**
 * Get SP metadata as XML string.
 * Returns null if SAML is not enabled.
 */
export function getSpMetadata(): string | null {
  if (!sp) return null;
  return sp.getMetadata();
}
