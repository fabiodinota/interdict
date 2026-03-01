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
  policyName: t.String(),
  requirementRef: t.Nullable(t.String()),
  requirementDescription: t.Nullable(t.String()),
  isRequired: t.Boolean(),
  sortOrder: t.Number(),
  compilationStatus: t.Nullable(t.String()),
});

/** Full framework detail response (single framework with policies) */
export const FrameworkResponse = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  jurisdiction: t.Nullable(t.String()),
  version: t.Nullable(t.String()),
  isSeeded: t.Boolean(),
  isActive: t.Boolean(),
  policies: t.Array(FrameworkPolicySchema),
});

/** Framework list item with activation status summary */
export const FrameworkListItem = t.Object({
  id: t.String({ format: "uuid" }),
  slug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  jurisdiction: t.Nullable(t.String()),
  version: t.Nullable(t.String()),
  isSeeded: t.Boolean(),
  isActive: t.Boolean(),
  policyCount: t.Number(),
  activePolicyCount: t.Number(),
});

/** List of frameworks */
export const FrameworkListResponse = t.Array(FrameworkListItem);

/** Body for activating a framework */
export const ActivateFrameworkBody = t.Object({
  notes: t.Optional(t.String()),
});

/** Body for toggling an individual framework policy */
export const TogglePolicyBody = t.Object({
  isRequired: t.Boolean(),
});
