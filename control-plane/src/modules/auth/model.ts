/**
 * Auth TypeBox Schemas
 *
 * Request/response validation schemas for auth and API key management endpoints.
 * Used by Elysia for runtime validation and OpenAPI generation.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Request Bodies
// ---------------------------------------------------------------------------

/** Body for POST /api/v1/auth/keys -- create a new API key */
export const CreateApiKeyBody = t.Object({
  label: t.Optional(t.String({ maxLength: 255 })),
});

/** Body for POST /api/v1/auth/saml/exchange-code -- one-time code exchange (CRIT-002) */
export const ExchangeCodeBody = t.Object({
  code: t.String({ minLength: 64, maxLength: 64 }),
});

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

/** Query for GET /api/v1/auth/keys -- list API keys with pagination */
export const ApiKeyListQuery = t.Object({
  page_size: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50 })),
  cursor: t.Optional(t.String()),
  all: t.Optional(t.String()), // "true" for super admins to see all keys
});

/** Path params for DELETE /api/v1/auth/keys/:keyId */
export const RevokeApiKeyParams = t.Object({
  keyId: t.String(),
});

// ---------------------------------------------------------------------------
// Response Schemas
// ---------------------------------------------------------------------------

/** Response for GET /api/v1/auth/me */
export const WhoAmIResponse = t.Object({
  id: t.String(),
  email: t.String(),
  displayName: t.String(),
  role: t.String(),
  departments: t.Array(t.String()),
  isService: t.Boolean(),
});

/** Response item for API key listing (never includes hash or plaintext) */
export const ApiKeyResponse = t.Object({
  id: t.String(),
  prefix: t.String(),
  label: t.Nullable(t.String()),
  is_active: t.Boolean(),
  last_used_at: t.Nullable(t.String()),
  created_at: t.String(),
});

/** Response for POST /api/v1/auth/keys -- includes one-time plaintext */
export const CreateApiKeyResponse = t.Object({
  id: t.String(),
  plaintext: t.String(),
  prefix: t.String(),
  label: t.Nullable(t.String()),
  created_at: t.String(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateApiKeyBodyType = typeof CreateApiKeyBody.static;
export type ApiKeyListQueryType = typeof ApiKeyListQuery.static;
