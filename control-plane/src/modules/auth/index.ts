/**
 * Auth Module - Elysia Plugin
 *
 * REST endpoints for API key management and user identity.
 * All endpoints require authentication via the auth macro.
 *
 * Endpoints:
 *   GET  /api/v1/auth/me          -- Current user profile (whoAmI)
 *   POST /api/v1/auth/keys        -- Create API key (plaintext returned once)
 *   GET  /api/v1/auth/keys        -- List API keys (never exposes hash)
 *   DELETE /api/v1/auth/keys/:keyId -- Revoke API key (soft delete)
 */

import { Elysia } from "elysia";
import { authPlugin } from "./middleware";
import { createAuthService } from "./service";
import {
  CreateApiKeyBody,
  ApiKeyListQuery,
  RevokeApiKeyParams,
} from "./model";
import {
  apiResponse,
  paginatedResponse,
} from "../../shared/utilities";

export const authModule = new Elysia({ prefix: "/api/v1/auth" })
  .use(authPlugin)
  .derive(({ store }) => {
    const db = (store as any).db;
    return { authService: createAuthService(db) };
  })

  // -------------------------------------------------------------------------
  // GET /me -- Current user profile
  // -------------------------------------------------------------------------
  .get(
    "/me",
    async (ctx: any) => {
      const profile = await ctx.authService.whoAmI(ctx.user.id);
      return apiResponse(profile);
    },
    { auth: true }
  )

  // -------------------------------------------------------------------------
  // POST /keys -- Create a new API key
  // -------------------------------------------------------------------------
  .post(
    "/keys",
    async (ctx: any) => {
      const result = await ctx.authService.createApiKey(
        ctx.user.id,
        ctx.body.label
      );
      ctx.set.status = 201;
      return apiResponse({
        id: result.keyId,
        plaintext: result.plaintext,
        prefix: result.prefix,
        label: result.label,
        created_at: result.createdAt.toISOString(),
      });
    },
    {
      auth: true,
      body: CreateApiKeyBody,
    }
  )

  // -------------------------------------------------------------------------
  // GET /keys -- List API keys for the authenticated user
  // -------------------------------------------------------------------------
  .get(
    "/keys",
    async (ctx: any) => {
      const pageSize = ctx.query.page_size
        ? Number(ctx.query.page_size)
        : undefined;
      const showAll = ctx.query.all === "true";
      const result = await ctx.authService.listApiKeys(
        ctx.user.id,
        ctx.user.role,
        showAll,
        ctx.query.cursor,
        pageSize
      );
      return paginatedResponse(result.items, result.nextCursor);
    },
    {
      auth: true,
      query: ApiKeyListQuery,
    }
  )

  // -------------------------------------------------------------------------
  // DELETE /keys/:keyId -- Revoke an API key
  // -------------------------------------------------------------------------
  .delete(
    "/keys/:keyId",
    async (ctx: any) => {
      await ctx.authService.revokeApiKey(
        ctx.params.keyId,
        ctx.user.id,
        ctx.user.role
      );
      ctx.set.status = 204;
      return;
    },
    {
      auth: true,
      params: RevokeApiKeyParams,
    }
  );
