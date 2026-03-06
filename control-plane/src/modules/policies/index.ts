/**
 * Policies Module - Elysia Plugin
 *
 * REST endpoints for policy CRUD with version history.
 * Pre-validates Rego syntax on create/update before saving.
 *
 * NOTE: Do NOT wire into src/index.ts -- module wiring is Plan 05-05.
 */

import { Elysia, t } from "elysia";
import {
  CreatePolicyBody,
  UpdatePolicyBody,
  PolicyListQuery,
} from "./model";
import { createPolicyService } from "./service";
import { validateRego } from "../compiler/validator";
import {
  apiResponse,
  paginatedResponse,
  ValidationError,
} from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";

export const policiesModule = new Elysia({ prefix: "/api/v1/policies" })
  .use(authPlugin)
  .derive(({ store }) => {
    const db = (store as any).db ?? pgDb;
    return { policyService: createPolicyService(db) };
  })

  // POST / -- Create policy (Policy Admin+)
  .post(
    "/",
    async (ctx: any) => {
      // Pre-validate Rego syntax
      const validation = await validateRego(ctx.body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await ctx.policyService.create(ctx.body);
      ctx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["policy_admin"], body: CreatePolicyBody }
  )

  // GET / -- List active policies (Read-Only Auditor+)
  .get(
    "/",
    async (ctx: any) => {
      const pageSize = ctx.query.page_size
        ? Number(ctx.query.page_size)
        : undefined;
      const { items, nextCursor } = await ctx.policyService.list(
        ctx.query.cursor,
        pageSize
      );
      return paginatedResponse(items, nextCursor);
    },
    { auth: ["read_only_auditor"], query: PolicyListQuery }
  )

  // GET /:id -- Get policy by ID (Read-Only Auditor+)
  .get(
    "/:id",
    async (ctx: any) => {
      const result = await ctx.policyService.getById(ctx.params.id);
      return apiResponse(result);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) }
  )

  // PUT /:id -- Update policy (creates new version) (Policy Admin+)
  .put(
    "/:id",
    async (ctx: any) => {
      // Pre-validate Rego syntax
      const validation = await validateRego(ctx.body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await ctx.policyService.update(ctx.params.id, ctx.body);
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: UpdatePolicyBody,
    }
  )

  // DELETE /:id -- Soft-delete policy (Policy Admin+)
  .delete(
    "/:id",
    async (ctx: any) => {
      await ctx.policyService.delete(ctx.params.id);
      ctx.set.status = 204;
      return;
    },
    { auth: ["policy_admin"], params: t.Object({ id: t.String() }) }
  )

  // GET /:id/versions -- Version history (Read-Only Auditor+)
  .get(
    "/:id/versions",
    async (ctx: any) => {
      const versions = await ctx.policyService.getVersionHistory(ctx.params.id);
      return apiResponse(versions);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) }
  )

  // POST /:id/restore/:versionId -- Restore a previous version (Policy Admin+)
  .post(
    "/:id/restore/:versionId",
    async (ctx: any) => {
      const result = await ctx.policyService.restoreVersion(
        ctx.params.id,
        ctx.params.versionId
      );
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
    }
  );
