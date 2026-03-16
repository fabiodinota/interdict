/**
 * Signing Keys Module - Elysia Plugin
 *
 * Admin API endpoints for Ed25519 signing key rotation and management.
 * Provides key listing, rotation, active key info, and public key
 * export for verification tools.
 */

import { Elysia } from "elysia";
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { apiRateLimiter } from "../auth";
import { createRateLimitHook } from "../auth/rate-limiter";
import type { SigningKeysService } from "./service";
import { createSigningKeysService } from "./service";

type SigningKeysRouteContext = RouteContext & {
  signingKeysService: SigningKeysService;
};

export const signingKeysModule = new Elysia({
  prefix: "/api/v1/admin/signing-keys",
})
  .use(authPlugin)
  .derive(({ store }) => {
    const appStore = store as unknown as Partial<AppStore>;
    return { signingKeysService: createSigningKeysService(appStore.db ?? pgDb) };
  })

  // GET / -- List all signing keys (Super Admin only)
  .get(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as SigningKeysRouteContext;
      const keys = await routeCtx.signingKeysService.listKeys();
      return apiResponse(keys);
    },
    { auth: ["super_admin"] },
  )

  // POST /rotate -- Trigger key rotation (Super Admin only)
  .post(
    "/rotate",
    async (ctx) => {
      const routeCtx = ctx as unknown as SigningKeysRouteContext;
      const outputPath = process.env.SIGNING_KEY_OUTPUT_PATH || undefined;
      const result = await routeCtx.signingKeysService.rotateKey(outputPath);
      routeCtx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["super_admin"], beforeHandle: createRateLimitHook(apiRateLimiter) },
  )

  // GET /active -- Get current active key public info (Policy Admin+)
  .get(
    "/active",
    async (ctx) => {
      const routeCtx = ctx as unknown as SigningKeysRouteContext;
      const key = await routeCtx.signingKeysService.getActiveKey();
      if (!key) {
        routeCtx.set.status = 404;
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "No active signing key" },
        };
      }
      return apiResponse(key);
    },
    { auth: ["policy_admin"] },
  )

  // GET /public-keys -- Get all public keys for verification (Read-Only Auditor+)
  .get(
    "/public-keys",
    async (ctx) => {
      const routeCtx = ctx as unknown as SigningKeysRouteContext;
      const keys = await routeCtx.signingKeysService.getAllPublicKeys();
      return apiResponse(keys);
    },
    { auth: ["read_only_auditor"] },
  );
