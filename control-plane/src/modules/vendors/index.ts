/**
 * Vendors Module - Elysia Plugin
 *
 * REST endpoints for vendor registry CRUD with per-model control.
 *
 * NOTE: Do NOT wire into src/index.ts -- module wiring is Plan 05-05.
 */

import { Elysia, t } from "elysia";
import {
  CreateVendorBody,
  UpdateVendorBody,
  CreateModelBody,
  UpdateModelBody,
  VendorListQuery,
} from "./model";
import { createVendorService } from "./service";
import { apiResponse, paginatedResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";

export const vendorsModule = new Elysia({ prefix: "/api/v1/vendors" })
  .use(authPlugin)
  .derive(({ store }) => {
    const db = (store as any).db;
    return { vendorService: createVendorService(db) };
  })

  // POST / -- Create vendor (Policy Admin+)
  .post(
    "/",
    async (ctx: any) => {
      const result = await ctx.vendorService.create(ctx.body);
      ctx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["policy_admin"], body: CreateVendorBody }
  )

  // GET / -- List vendors with optional status filter (Read-Only Auditor+)
  .get(
    "/",
    async (ctx: any) => {
      const pageSize = ctx.query.page_size
        ? Number(ctx.query.page_size)
        : undefined;
      const { items, nextCursor } = await ctx.vendorService.list(
        ctx.query.cursor,
        pageSize,
        ctx.query.status
      );
      return paginatedResponse(items, nextCursor);
    },
    { auth: ["read_only_auditor"], query: VendorListQuery }
  )

  // GET /:id -- Get vendor with models (Read-Only Auditor+)
  .get(
    "/:id",
    async (ctx: any) => {
      const result = await ctx.vendorService.getById(ctx.params.id);
      return apiResponse(result);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) }
  )

  // PUT /:id -- Update vendor (Policy Admin+)
  .put(
    "/:id",
    async (ctx: any) => {
      const result = await ctx.vendorService.update(ctx.params.id, ctx.body);
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: UpdateVendorBody,
    }
  )

  // DELETE /:id -- Delete vendor (Policy Admin+)
  .delete(
    "/:id",
    async (ctx: any) => {
      await ctx.vendorService.delete(ctx.params.id);
      ctx.set.status = 204;
      return;
    },
    { auth: ["policy_admin"], params: t.Object({ id: t.String() }) }
  )

  // POST /:id/models -- Add model to vendor (Policy Admin+)
  .post(
    "/:id/models",
    async (ctx: any) => {
      const result = await ctx.vendorService.addModel(ctx.params.id, ctx.body);
      ctx.set.status = 201;
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: CreateModelBody,
    }
  )

  // PUT /:id/models/:modelId -- Update model status (Policy Admin+)
  .put(
    "/:id/models/:modelId",
    async (ctx: any) => {
      const result = await ctx.vendorService.updateModel(
        ctx.params.id,
        ctx.params.modelId,
        ctx.body
      );
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: UpdateModelBody,
    }
  )

  // DELETE /:id/models/:modelId -- Remove model (Policy Admin+)
  .delete(
    "/:id/models/:modelId",
    async (ctx: any) => {
      await ctx.vendorService.removeModel(ctx.params.id, ctx.params.modelId);
      ctx.set.status = 204;
      return;
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String(), modelId: t.String() }),
    }
  );
