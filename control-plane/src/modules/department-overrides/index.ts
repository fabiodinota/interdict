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
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import {
  DepartmentIdParam,
  OverrideIdParam,
  PolicyIdParam,
  SetMandatoryBody,
  SetOverrideBody,
} from "./model";
import { DepartmentOverrideService } from "./service";

type DepartmentOverrideRouteContext<
  TBody = unknown,
  TParams = Record<string, string>,
> = RouteContext<TBody, Record<string, string | undefined>, TParams> & {
  overrideService: DepartmentOverrideService;
};

export const departmentOverridesModule = new Elysia({
  prefix: "/api/v1/department-overrides",
})
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive service from decorated db
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    return {
      overrideService: new DepartmentOverrideService(s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // GET /effective/:departmentId -- Effective policy list for a department
  // ---------------------------------------------------------------------------
  .get(
    "/effective/:departmentId",
    async (ctx) => {
      const routeCtx = ctx as unknown as DepartmentOverrideRouteContext<
        unknown,
        { departmentId: string }
      >;
      const policies = await routeCtx.overrideService.getEffectivePolicies(
        routeCtx.params.departmentId,
        routeCtx.user.id,
        routeCtx.user.role,
      );
      return apiResponse(policies);
    },
    {
      auth: ["department_manager"],
      params: DepartmentIdParam,
    },
  )

  // ---------------------------------------------------------------------------
  // PUT /override -- Create or update a department policy override
  // ---------------------------------------------------------------------------
  .put(
    "/override",
    async (ctx) => {
      const routeCtx = ctx as unknown as DepartmentOverrideRouteContext<{
        department_id: string;
        policy_id: string;
        enabled: boolean;
      }>;
      const result = await routeCtx.overrideService.setOverride(
        routeCtx.body.department_id,
        routeCtx.body.policy_id,
        routeCtx.body.enabled,
        routeCtx.user.id,
        routeCtx.user.role,
      );
      return apiResponse(result);
    },
    {
      auth: ["department_manager"],
      body: SetOverrideBody,
    },
  )

  // ---------------------------------------------------------------------------
  // DELETE /override/:id -- Remove an override (revert to global default)
  // ---------------------------------------------------------------------------
  .delete(
    "/override/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as DepartmentOverrideRouteContext<unknown, { id: string }>;
      await routeCtx.overrideService.removeOverride(
        routeCtx.params.id,
        routeCtx.user.id,
        routeCtx.user.role,
      );
      return apiResponse({ deleted: true });
    },
    {
      auth: ["department_manager"],
      params: OverrideIdParam,
    },
  )

  // ---------------------------------------------------------------------------
  // PUT /mandatory/:policyId -- Toggle mandatory flag (compliance_officer+)
  // ---------------------------------------------------------------------------
  .put(
    "/mandatory/:policyId",
    async (ctx) => {
      const routeCtx = ctx as unknown as DepartmentOverrideRouteContext<
        { is_mandatory: boolean },
        { policyId: string }
      >;
      await routeCtx.overrideService.setMandatory(
        routeCtx.params.policyId,
        routeCtx.body.is_mandatory,
      );
      return apiResponse({ updated: true });
    },
    {
      auth: ["compliance_officer"],
      params: PolicyIdParam,
      body: SetMandatoryBody,
    },
  );
