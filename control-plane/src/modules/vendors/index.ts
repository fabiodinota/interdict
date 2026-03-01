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

export const vendorsModule = new Elysia({ prefix: "/api/v1/vendors" })
  .derive(({ store }) => {
    const db = (store as any).db;
    return { vendorService: createVendorService(db) };
  })

  // POST / -- Create vendor
  .post(
    "/",
    async ({ body, vendorService, set }) => {
      const result = await vendorService.create(body);
      set.status = 201;
      return apiResponse(result);
    },
    { body: CreateVendorBody }
  )

  // GET / -- List vendors with optional status filter
  .get(
    "/",
    async ({ query, vendorService }) => {
      const pageSize = query.page_size
        ? Number(query.page_size)
        : undefined;
      const { items, nextCursor } = await vendorService.list(
        query.cursor,
        pageSize,
        query.status
      );
      return paginatedResponse(items, nextCursor);
    },
    { query: VendorListQuery }
  )

  // GET /:id -- Get vendor with models
  .get(
    "/:id",
    async ({ params, vendorService }) => {
      const result = await vendorService.getById(params.id);
      return apiResponse(result);
    },
    { params: t.Object({ id: t.String() }) }
  )

  // PUT /:id -- Update vendor
  .put(
    "/:id",
    async ({ params, body, vendorService }) => {
      const result = await vendorService.update(params.id, body);
      return apiResponse(result);
    },
    {
      params: t.Object({ id: t.String() }),
      body: UpdateVendorBody,
    }
  )

  // DELETE /:id -- Delete vendor
  .delete(
    "/:id",
    async ({ params, vendorService, set }) => {
      await vendorService.delete(params.id);
      set.status = 204;
      return;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // POST /:id/models -- Add model to vendor
  .post(
    "/:id/models",
    async ({ params, body, vendorService, set }) => {
      const result = await vendorService.addModel(params.id, body);
      set.status = 201;
      return apiResponse(result);
    },
    {
      params: t.Object({ id: t.String() }),
      body: CreateModelBody,
    }
  )

  // PUT /:id/models/:modelId -- Update model status
  .put(
    "/:id/models/:modelId",
    async ({ params, body, vendorService }) => {
      const result = await vendorService.updateModel(
        params.id,
        params.modelId,
        body
      );
      return apiResponse(result);
    },
    {
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: UpdateModelBody,
    }
  )

  // DELETE /:id/models/:modelId -- Remove model
  .delete(
    "/:id/models/:modelId",
    async ({ params, vendorService, set }) => {
      await vendorService.removeModel(params.id, params.modelId);
      set.status = 204;
      return;
    },
    {
      params: t.Object({ id: t.String(), modelId: t.String() }),
    }
  );
