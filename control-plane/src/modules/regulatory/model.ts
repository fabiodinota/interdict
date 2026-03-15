/**
 * Regulatory Module TypeBox Schemas
 *
 * Request/response validation schemas for regulatory framework management.
 */

import { t } from "elysia";

/** Single framework policy within a framework detail response */
export const FrameworkPolicySchema = t.Object({
  id: t.String({ format: "uuid" }),
  policyId: t.String({ format: "uuid" }),
  policyName: t.String({ maxLength: 500 }),
  requirementRef: t.Nullable(t.String({ maxLength: 500 })),
  requirementDescription: t.Nullable(t.String({ maxLength: 10_000 })),
  isRequired: t.Boolean(),
  sortOrder: t.Number(),
  compilationStatus: t.Nullable(t.String({ maxLength: 255 })),
});

/** Full framework detail response (single framework with policies) */
export const FrameworkResponse = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String({ maxLength: 255 }),
  name: t.String({ maxLength: 500 }),
  description: t.Nullable(t.String({ maxLength: 10_000 })),
  jurisdiction: t.Nullable(t.String({ maxLength: 500 })),
  version: t.Nullable(t.String({ maxLength: 255 })),
  isSeeded: t.Boolean(),
  isActive: t.Boolean(),
  policies: t.Array(FrameworkPolicySchema),
});

/** Framework list item with activation status summary */
export const FrameworkListItem = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String({ maxLength: 255 }),
  name: t.String({ maxLength: 500 }),
  description: t.Nullable(t.String({ maxLength: 10_000 })),
  jurisdiction: t.Nullable(t.String({ maxLength: 500 })),
  version: t.Nullable(t.String({ maxLength: 255 })),
  isSeeded: t.Boolean(),
  isActive: t.Boolean(),
  policyCount: t.Number(),
  activePolicyCount: t.Number(),
});

/** List of frameworks */
export const FrameworkListResponse = t.Array(FrameworkListItem);

/** Body for activating a framework */
export const ActivateFrameworkBody = t.Object({
  notes: t.Optional(t.String({ maxLength: 5_000 })),
});

/** Body for toggling an individual framework policy */
export const TogglePolicyBody = t.Object({
  isRequired: t.Boolean(),
});
