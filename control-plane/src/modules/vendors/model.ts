/**
 * Vendor TypeBox Schemas
 *
 * Request/response validation schemas for vendor registry endpoints.
 * Used by Elysia for runtime validation and OpenAPI generation.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Request Bodies
// ---------------------------------------------------------------------------

export const CreateVendorBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  display_name: t.String({ minLength: 1, maxLength: 255 }),
  base_url: t.Optional(t.String({ maxLength: 2_000 })),
  description: t.Optional(t.String({ maxLength: 10_000 })),
});

export const UpdateVendorBody = t.Object({
  display_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  status: t.Optional(t.Union([t.Literal("approved"), t.Literal("blocked")])),
  base_url: t.Optional(t.String({ maxLength: 2_000 })),
  description: t.Optional(t.String({ maxLength: 10_000 })),
});

export const CreateModelBody = t.Object({
  model_name: t.String({ minLength: 1, maxLength: 255 }),
  status: t.Optional(t.Union([t.Literal("approved"), t.Literal("blocked")])),
});

export const UpdateModelBody = t.Object({
  status: t.Union([t.Literal("approved"), t.Literal("blocked")]),
});

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

export const VendorListQuery = t.Object({
  page_size: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50 })),
  cursor: t.Optional(t.String({ maxLength: 255 })),
  status: t.Optional(t.Union([t.Literal("approved"), t.Literal("blocked")])),
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type CreateVendorBodyType = typeof CreateVendorBody.static;
export type UpdateVendorBodyType = typeof UpdateVendorBody.static;
export type CreateModelBodyType = typeof CreateModelBody.static;
export type UpdateModelBodyType = typeof UpdateModelBody.static;
export type VendorListQueryType = typeof VendorListQuery.static;
