/**
 * Policies Module - Elysia Plugin
 *
 * REST endpoints for policy CRUD with version history.
 * Pre-validates Rego syntax on create/update before saving.
 *
 * NOTE: Do NOT wire into src/index.ts -- module wiring is Plan 05-05.
 */

import { Elysia, t } from "elysia";
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse, paginatedResponse, ValidationError } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { apiRateLimiter } from "../auth";
import { createRateLimitHook } from "../auth/rate-limiter";
import { validateRego } from "../compiler/validator";
import {
  CreatePolicyBody,
  type CreatePolicyBodyType,
  PolicyListQuery,
  type PolicyListQueryType,
  UpdatePolicyBody,
  type UpdatePolicyBodyType,
} from "./model";
import { createPolicyService, type PolicyService } from "./service";

type PolicyRouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
  TParams = Record<string, string>,
> = RouteContext<TBody, TQuery, TParams> & { policyService: PolicyService };

export const policiesModule = new Elysia({ prefix: "/api/v1/policies" })
  .use(authPlugin)
  .derive(({ store }) => {
    const appStore = store as unknown as Partial<AppStore>;
    return { policyService: createPolicyService(appStore.db ?? pgDb) };
  })

  // POST / -- Create policy (Policy Admin+)
  .post(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<CreatePolicyBodyType>;
      // Pre-validate Rego syntax
      const validation = await validateRego(routeCtx.body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await routeCtx.policyService.create(routeCtx.body);
      routeCtx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["policy_admin"], body: CreatePolicyBody, beforeHandle: createRateLimitHook(apiRateLimiter) },
  )

  // GET / -- List active policies (Read-Only Auditor+)
  .get(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<unknown, PolicyListQueryType>;
      const pageSize = routeCtx.query.page_size ? Number(routeCtx.query.page_size) : undefined;
      const { items, nextCursor } = await routeCtx.policyService.list(
        routeCtx.query.cursor,
        pageSize,
      );
      return paginatedResponse(items, nextCursor);
    },
    { auth: ["read_only_auditor"], query: PolicyListQuery },
  )

  // GET /:id -- Get policy by ID (Read-Only Auditor+)
  .get(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string }
      >;
      const result = await routeCtx.policyService.getById(routeCtx.params.id);
      return apiResponse(result);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) },
  )

  // PUT /:id -- Update policy (creates new version) (Policy Admin+)
  .put(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<
        UpdatePolicyBodyType,
        Record<string, string | undefined>,
        { id: string }
      >;
      // Pre-validate Rego syntax
      const validation = await validateRego(routeCtx.body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await routeCtx.policyService.update(routeCtx.params.id, routeCtx.body);
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: UpdatePolicyBody,
    },
  )

  // DELETE /:id -- Soft-delete policy (Policy Admin+)
  .delete(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string }
      >;
      await routeCtx.policyService.delete(routeCtx.params.id);
      routeCtx.set.status = 204;
      return;
    },
    { auth: ["policy_admin"], params: t.Object({ id: t.String() }) },
  )

  // GET /:id/versions -- Version history (Read-Only Auditor+)
  .get(
    "/:id/versions",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string }
      >;
      const versions = await routeCtx.policyService.getVersionHistory(routeCtx.params.id);
      return apiResponse(versions);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) },
  )

  // POST /:id/restore/:versionId -- Restore a previous version (Policy Admin+)
  .post(
    "/:id/restore/:versionId",
    async (ctx) => {
      const routeCtx = ctx as unknown as PolicyRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string; versionId: string }
      >;
      const result = await routeCtx.policyService.restoreVersion(
        routeCtx.params.id,
        routeCtx.params.versionId,
      );
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
    },
  );
