/**
 * Department Overrides Module - Elysia Plugin
 *
 * REST endpoints for department-scoped policy override management.
 * Department managers can toggle non-mandatory inherited policies.
 * Compliance officers can mark policies as mandatory.
 *
 * Prefix: /api/v1/department-overrides
 */

import { Elysia } from "elysia";
import { DepartmentOverrideService } from "./service";
import {
  DepartmentIdParam,
  SetOverrideBody,
  OverrideIdParam,
  PolicyIdParam,
  SetMandatoryBody,
} from "./model";
import { apiResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";

export const departmentOverridesModule = new Elysia({
  prefix: "/api/v1/department-overrides",
})
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive service from decorated db
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as { db: any };
    return {
      overrideService: new DepartmentOverrideService(s.db),
    };
  })

  // ---------------------------------------------------------------------------
  // GET /effective/:departmentId -- Effective policy list for a department
  // ---------------------------------------------------------------------------
  .get(
    "/effective/:departmentId",
    async (ctx: any) => {
      const policies = await ctx.overrideService.getEffectivePolicies(
        ctx.params.departmentId,
        ctx.user.id,
        ctx.user.role
      );
      return apiResponse(policies);
    },
    {
      auth: ["department_manager"],
      params: DepartmentIdParam,
    }
  )

  // ---------------------------------------------------------------------------
  // PUT /override -- Create or update a department policy override
  // ---------------------------------------------------------------------------
  .put(
    "/override",
    async (ctx: any) => {
      const result = await ctx.overrideService.setOverride(
        ctx.body.department_id,
        ctx.body.policy_id,
        ctx.body.enabled,
        ctx.user.id,
        ctx.user.role
      );
      return apiResponse(result);
    },
    {
      auth: ["department_manager"],
      body: SetOverrideBody,
    }
  )

  // ---------------------------------------------------------------------------
  // DELETE /override/:id -- Remove an override (revert to global default)
  // ---------------------------------------------------------------------------
  .delete(
    "/override/:id",
    async (ctx: any) => {
      await ctx.overrideService.removeOverride(
        ctx.params.id,
        ctx.user.id,
        ctx.user.role
      );
      return apiResponse({ deleted: true });
    },
    {
      auth: ["department_manager"],
      params: OverrideIdParam,
    }
  )

  // ---------------------------------------------------------------------------
  // PUT /mandatory/:policyId -- Toggle mandatory flag (compliance_officer+)
  // ---------------------------------------------------------------------------
  .put(
    "/mandatory/:policyId",
    async (ctx: any) => {
      await ctx.overrideService.setMandatory(
        ctx.params.policyId,
        ctx.body.is_mandatory
      );
      return apiResponse({ updated: true });
    },
    {
      auth: ["compliance_officer"],
      params: PolicyIdParam,
      body: SetMandatoryBody,
    }
  );
