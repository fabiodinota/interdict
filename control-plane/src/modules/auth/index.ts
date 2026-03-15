/**
 * Auth Module - Elysia Plugin
 *
 * REST endpoints for API key management, user identity, and SAML SSO.
 * API key and profile endpoints require authentication via the auth macro.
 * SAML endpoints (ACS, metadata) are unauthenticated by design.
 *
 * Endpoints:
 *   GET  /api/v1/auth/me              -- Current user profile (whoAmI)
 *   POST /api/v1/auth/keys            -- Create API key (plaintext returned once)
 *   GET  /api/v1/auth/keys            -- List API keys (never exposes hash)
 *   DELETE /api/v1/auth/keys/:keyId   -- Revoke API key (soft delete)
 *   GET  /api/v1/auth/saml/sso        -- Initiate SAML SSO (redirect to IdP)
 *   POST /api/v1/auth/saml/acs        -- Assertion Consumer Service
 *   GET  /api/v1/auth/saml/slo        -- Single Logout
 *   GET  /api/v1/auth/saml/metadata   -- SP metadata XML
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Elysia } from "elysia";
import { db as pgDb } from "../../db/postgres";
import type * as schema from "../../db/schema";
import { apiError, apiResponse, paginatedResponse } from "../../shared/utilities";
import { authPlugin } from "./middleware";
import {
  ApiKeyListQuery,
  CreateApiKeyBody,
  ExchangeApiKeyBody,
  ExchangeCodeBody,
  RevokeApiKeyParams,
} from "./model";
import { RateLimiter, createRateLimitHook } from "./rate-limiter";
import { createSamlRoutes } from "./saml/handlers";
import { type AuthenticatedUser, type AuthService, createAuthService } from "./service";

/**
 * Shared rate limiter for auth endpoints (H-02 mitigation).
 * Default: 10 requests per minute per IP, cleanup every 60s.
 * Exported for testing and graceful shutdown.
 */
export const authRateLimiter = new RateLimiter({
  maxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  cleanupIntervalMs: 60_000,
});

/**
 * Auth route handler context.
 *
 * Elysia macro-injected properties (like `user` from authPlugin) are not
 * visible to tsc via the inferred context type.  We cast handler params to
 * this interface so business logic gets full type safety while keeping tsc
 * happy.  The cast is safe because all routes using `{ auth: true }` are
 * guaranteed to have `user` injected by the resolve macro.
 */
interface AuthCtx {
  user: AuthenticatedUser;
  authService: AuthService;
  body: Record<string, unknown>;
  query: Record<string, string | undefined>;
  params: Record<string, string>;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/** Per-route beforeHandle hook for rate-limited auth endpoints */
const rateLimitHook = createRateLimitHook(authRateLimiter);

export const authModule = new Elysia({ prefix: "/api/v1/auth" })
  .use(authPlugin)
  .derive(({ store }) => {
    const db = (store as { db?: PostgresJsDatabase<typeof schema> }).db ?? pgDb;
    return { authService: createAuthService(db) };
  })

  // -------------------------------------------------------------------------
  // GET /me -- Current user profile
  // -------------------------------------------------------------------------
  .get(
    "/me",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const profile = await ctx.authService.whoAmI(ctx.user.id);
      return apiResponse(profile);
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /session/exchange-api-key -- exchange API key for opaque session
  // Rate limited (H-02): prevents brute-force API key enumeration
  // -------------------------------------------------------------------------
  .post(
    "/session/exchange-api-key",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const result = await ctx.authService.exchangeApiKeyForSession(ctx.body.apiKey as string);

      if (!result) {
        ctx.set.status = 401;
        return apiError("UNAUTHORIZED", "Invalid API key");
      }

      return apiResponse(result);
    },
    {
      body: ExchangeApiKeyBody,
      beforeHandle: rateLimitHook,
    },
  )

  // -------------------------------------------------------------------------
  // POST /keys -- Create a new API key
  // -------------------------------------------------------------------------
  .post(
    "/keys",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const result = await ctx.authService.createApiKey(
        ctx.user.id,
        ctx.body.label as string | undefined,
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
    },
  )

  // -------------------------------------------------------------------------
  // GET /keys -- List API keys for the authenticated user
  // -------------------------------------------------------------------------
  .get(
    "/keys",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const pageSize = ctx.query.page_size ? Number(ctx.query.page_size) : undefined;
      const showAll = ctx.query.all === "true";
      const result = await ctx.authService.listApiKeys(
        ctx.user.id,
        ctx.user.role,
        showAll,
        ctx.query.cursor,
        pageSize,
      );
      return paginatedResponse(result.items, result.nextCursor);
    },
    {
      auth: true,
      query: ApiKeyListQuery,
    },
  )

  // -------------------------------------------------------------------------
  // DELETE /keys/:keyId -- Revoke an API key
  // -------------------------------------------------------------------------
  .delete(
    "/keys/:keyId",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      await ctx.authService.revokeApiKey(ctx.params.keyId, ctx.user.id, ctx.user.role);
      ctx.set.status = 204;
      return;
    },
    {
      auth: true,
      params: RevokeApiKeyParams,
    },
  )

  // -------------------------------------------------------------------------
  // POST /logout -- Revoke server-side session (HIGH-003)
  // -------------------------------------------------------------------------
  .post(
    "/logout",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const authHeader = ctx.headers.authorization;
      const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (rawToken) {
        await ctx.authService.revokeSession(rawToken);
      }
      ctx.set.status = 204;
      return;
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /saml/exchange-code -- One-time code -> session token (CRIT-002)
  // Unauthenticated: the code IS the credential for this one exchange.
  // Rate limited (H-02): prevents brute-force code enumeration
  // -------------------------------------------------------------------------
  .post(
    "/saml/exchange-code",
    async (rawCtx) => {
      const ctx = rawCtx as unknown as AuthCtx;
      const code = ctx.body.code as string;
      const sessionToken = await ctx.authService.exchangeSamlHandoffCode(code);
      if (!sessionToken) {
        ctx.set.status = 410;
        return {
          success: false,
          error: { code: "CODE_EXPIRED", message: "Code is invalid, expired, or already used." },
        };
      }
      return { success: true, data: { token: sessionToken } };
    },
    {
      body: ExchangeCodeBody,
      beforeHandle: rateLimitHook,
    },
  )

  // -------------------------------------------------------------------------
  // SAML SSO Routes (conditionally mounted when SAML is configured)
  // -------------------------------------------------------------------------
  .use(createSamlRoutes(authRateLimiter));
