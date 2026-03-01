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

export const policiesModule = new Elysia({ prefix: "/api/v1/policies" })
  .derive(({ store }) => {
    const db = (store as any).db;
    return { policyService: createPolicyService(db) };
  })

  // POST / -- Create policy
  .post(
    "/",
    async ({ body, policyService, set }) => {
      // Pre-validate Rego syntax
      const validation = await validateRego(body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await policyService.create(body);
      set.status = 201;
      return apiResponse(result);
    },
    { body: CreatePolicyBody }
  )

  // GET / -- List active policies
  .get(
    "/",
    async ({ query, policyService }) => {
      const pageSize = query.page_size
        ? Number(query.page_size)
        : undefined;
      const { items, nextCursor } = await policyService.list(
        query.cursor,
        pageSize
      );
      return paginatedResponse(items, nextCursor);
    },
    { query: PolicyListQuery }
  )

  // GET /:id -- Get policy by ID
  .get(
    "/:id",
    async ({ params, policyService }) => {
      const result = await policyService.getById(params.id);
      return apiResponse(result);
    },
    { params: t.Object({ id: t.String() }) }
  )

  // PUT /:id -- Update policy (creates new version)
  .put(
    "/:id",
    async ({ params, body, policyService }) => {
      // Pre-validate Rego syntax
      const validation = await validateRego(body.rego_source);
      if (!validation.valid) {
        throw new ValidationError("Invalid Rego syntax", validation.errors);
      }

      const result = await policyService.update(params.id, body);
      return apiResponse(result);
    },
    {
      params: t.Object({ id: t.String() }),
      body: UpdatePolicyBody,
    }
  )

  // DELETE /:id -- Soft-delete policy
  .delete(
    "/:id",
    async ({ params, policyService, set }) => {
      await policyService.delete(params.id);
      set.status = 204;
      return;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // GET /:id/versions -- Version history
  .get(
    "/:id/versions",
    async ({ params, policyService }) => {
      const versions = await policyService.getVersionHistory(params.id);
      return apiResponse(versions);
    },
    { params: t.Object({ id: t.String() }) }
  )

  // POST /:id/restore/:versionId -- Restore a previous version
  .post(
    "/:id/restore/:versionId",
    async ({ params, policyService }) => {
      const result = await policyService.restoreVersion(
        params.id,
        params.versionId
      );
      return apiResponse(result);
    },
    {
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
    }
  );
