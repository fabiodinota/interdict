/**
 * Vendors Module - Elysia Plugin
 *
 * REST endpoints for vendor registry CRUD with per-model control.
 *
 * NOTE: Do NOT wire into src/index.ts -- module wiring is Plan 05-05.
 */

import { Elysia, t } from "elysia";
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse, paginatedResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { apiRateLimiter } from "../auth";
import { createRateLimitHook } from "../auth/rate-limiter";
import {
  CreateModelBody,
  type CreateModelBodyType,
  CreateVendorBody,
  type CreateVendorBodyType,
  UpdateModelBody,
  type UpdateModelBodyType,
  UpdateVendorBody,
  type UpdateVendorBodyType,
  VendorListQuery,
  type VendorListQueryType,
} from "./model";
import { createVendorService, type VendorService } from "./service";

type VendorRouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
  TParams = Record<string, string>,
> = RouteContext<TBody, TQuery, TParams> & { vendorService: VendorService };

export const vendorsModule = new Elysia({ prefix: "/api/v1/vendors" })
  .use(authPlugin)
  .derive(({ store }) => {
    const appStore = store as unknown as Partial<AppStore>;
    return { vendorService: createVendorService(appStore.db ?? pgDb) };
  })

  // POST / -- Create vendor (Policy Admin+)
  .post(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<CreateVendorBodyType>;
      const result = await routeCtx.vendorService.create(routeCtx.body);
      routeCtx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["policy_admin"], body: CreateVendorBody, beforeHandle: createRateLimitHook(apiRateLimiter) },
  )

  // GET / -- List vendors with optional status filter (Read-Only Auditor+)
  .get(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<unknown, VendorListQueryType>;
      const pageSize = routeCtx.query.page_size ? Number(routeCtx.query.page_size) : undefined;
      const { items, nextCursor } = await routeCtx.vendorService.list(
        routeCtx.query.cursor,
        pageSize,
        routeCtx.query.status,
      );
      return paginatedResponse(items, nextCursor);
    },
    { auth: ["read_only_auditor"], query: VendorListQuery },
  )

  // GET /:id -- Get vendor with models (Read-Only Auditor+)
  .get(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string }
      >;
      const result = await routeCtx.vendorService.getById(routeCtx.params.id);
      return apiResponse(result);
    },
    { auth: ["read_only_auditor"], params: t.Object({ id: t.String() }) },
  )

  // PUT /:id -- Update vendor (Policy Admin+)
  .put(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        UpdateVendorBodyType,
        Record<string, string | undefined>,
        { id: string }
      >;
      const result = await routeCtx.vendorService.update(routeCtx.params.id, routeCtx.body);
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: UpdateVendorBody,
    },
  )

  // DELETE /:id -- Delete vendor (Policy Admin+)
  .delete(
    "/:id",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string }
      >;
      await routeCtx.vendorService.delete(routeCtx.params.id);
      routeCtx.set.status = 204;
      return;
    },
    { auth: ["policy_admin"], params: t.Object({ id: t.String() }) },
  )

  // POST /:id/models -- Add model to vendor (Policy Admin+)
  .post(
    "/:id/models",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        CreateModelBodyType,
        Record<string, string | undefined>,
        { id: string }
      >;
      const result = await routeCtx.vendorService.addModel(routeCtx.params.id, routeCtx.body);
      routeCtx.set.status = 201;
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String() }),
      body: CreateModelBody,
    },
  )

  // PUT /:id/models/:modelId -- Update model status (Policy Admin+)
  .put(
    "/:id/models/:modelId",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        UpdateModelBodyType,
        Record<string, string | undefined>,
        { id: string; modelId: string }
      >;
      const result = await routeCtx.vendorService.updateModel(
        routeCtx.params.id,
        routeCtx.params.modelId,
        routeCtx.body,
      );
      return apiResponse(result);
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: UpdateModelBody,
    },
  )

  // DELETE /:id/models/:modelId -- Remove model (Policy Admin+)
  .delete(
    "/:id/models/:modelId",
    async (ctx) => {
      const routeCtx = ctx as unknown as VendorRouteContext<
        unknown,
        Record<string, string | undefined>,
        { id: string; modelId: string }
      >;
      await routeCtx.vendorService.removeModel(routeCtx.params.id, routeCtx.params.modelId);
      routeCtx.set.status = 204;
      return;
    },
    {
      auth: ["policy_admin"],
      params: t.Object({ id: t.String(), modelId: t.String() }),
    },
  );
