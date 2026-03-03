/**
 * Department Overrides Module - TypeBox Schemas
 *
 * Type definitions for department policy override endpoints:
 * effective policy list, override creation/removal, mandatory toggle.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// GET /effective/:departmentId
// ---------------------------------------------------------------------------

/** Path parameter for department-scoped queries */
export const DepartmentIdParam = t.Object({
  departmentId: t.String({ format: "uuid" }),
});

/** A single effective policy row returned by the effective policies endpoint */
export interface EffectivePolicyRow {
  policyId: string;
  name: string;
  description: string | null;
  globalEnabled: boolean;
  effectiveEnabled: boolean;
  isMandatory: boolean;
  source: "Global" | "Department override";
  overrideId: string | null;
}

// ---------------------------------------------------------------------------
// PUT /override
// ---------------------------------------------------------------------------

/** Body for creating or updating a department policy override */
export const SetOverrideBody = t.Object({
  department_id: t.String({ format: "uuid" }),
  policy_id: t.String({ format: "uuid" }),
  enabled: t.Boolean(),
});

// ---------------------------------------------------------------------------
// DELETE /override/:id
// ---------------------------------------------------------------------------

/** Path parameter for removing a specific override */
export const OverrideIdParam = t.Object({
  id: t.String({ format: "uuid" }),
});

// ---------------------------------------------------------------------------
// PUT /mandatory/:policyId
// ---------------------------------------------------------------------------

/** Path parameter for mandatory toggle */
export const PolicyIdParam = t.Object({
  policyId: t.String({ format: "uuid" }),
});

/** Body for toggling mandatory flag on a policy */
export const SetMandatoryBody = t.Object({
  is_mandatory: t.Boolean(),
});
