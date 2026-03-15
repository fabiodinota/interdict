/**
 * Policy TypeBox Schemas
 *
 * Request/response validation schemas for policy CRUD endpoints.
 * Used by Elysia for runtime validation and OpenAPI generation.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Request Bodies
// ---------------------------------------------------------------------------

export const CreatePolicyBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 10_000 })),
  rego_source: t.String({ minLength: 1, maxLength: 500_000 }),
  entrypoint: t.Optional(t.String({ maxLength: 500, default: "interdict/policy/verdict" })),
});

export const UpdatePolicyBody = t.Object({
  rego_source: t.String({ minLength: 1, maxLength: 500_000 }),
  entrypoint: t.Optional(t.String({ maxLength: 500 })),
  change_description: t.Optional(t.String({ maxLength: 5_000 })),
});

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

export const PolicyListQuery = t.Object({
  page_size: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50 })),
  cursor: t.Optional(t.String({ maxLength: 255 })),
});

// ---------------------------------------------------------------------------
// Response Schemas
// ---------------------------------------------------------------------------

export const PolicyVersionResponse = t.Object({
  id: t.String(),
  version: t.Number(),
  rego_source: t.String(),
  entrypoint: t.String(),
  compilation_status: t.Union([
    t.Literal("pending"),
    t.Literal("compiling"),
    t.Literal("compiled"),
    t.Literal("failed"),
  ]),
  compilation_error: t.Nullable(t.String()),
  wasm_hash: t.Nullable(t.String()),
  wasm_size_bytes: t.Nullable(t.Number()),
  created_at: t.String(),
  change_description: t.Nullable(t.String()),
});

export const PolicyResponse = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  current_version: t.Optional(PolicyVersionResponse),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreatePolicyBodyType = typeof CreatePolicyBody.static;
export type UpdatePolicyBodyType = typeof UpdatePolicyBody.static;
export type PolicyListQueryType = typeof PolicyListQuery.static;
