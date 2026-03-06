/**
 * Signing Keys Module - Elysia Plugin
 *
 * Admin API endpoints for Ed25519 signing key rotation and management.
 * Provides key listing, rotation, active key info, and public key
 * export for verification tools.
 */

import { Elysia } from "elysia";
import { createSigningKeysService } from "./service";
import { apiResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";

export const signingKeysModule = new Elysia({
  prefix: "/api/v1/admin/signing-keys",
})
  .use(authPlugin)
  .derive(({ store }) => {
    const db = (store as any).db ?? pgDb;
    return { signingKeysService: createSigningKeysService(db) };
  })

  // GET / -- List all signing keys (Super Admin only)
  .get(
    "/",
    async (ctx: any) => {
      const keys = await ctx.signingKeysService.listKeys();
      return apiResponse(keys);
    },
    { auth: ["super_admin"] }
  )

  // POST /rotate -- Trigger key rotation (Super Admin only)
  .post(
    "/rotate",
    async (ctx: any) => {
      const outputPath = process.env.SIGNING_KEY_OUTPUT_PATH || undefined;
      const result = await ctx.signingKeysService.rotateKey(outputPath);
      ctx.set.status = 201;
      return apiResponse(result);
    },
    { auth: ["super_admin"] }
  )

  // GET /active -- Get current active key public info (Policy Admin+)
  .get(
    "/active",
    async (ctx: any) => {
      const key = await ctx.signingKeysService.getActiveKey();
      if (!key) {
        ctx.set.status = 404;
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "No active signing key" },
        };
      }
      return apiResponse(key);
    },
    { auth: ["policy_admin"] }
  )

  // GET /public-keys -- Get all public keys for verification (Read-Only Auditor+)
  .get(
    "/public-keys",
    async (ctx: any) => {
      const keys = await ctx.signingKeysService.getAllPublicKeys();
      return apiResponse(keys);
    },
    { auth: ["read_only_auditor"] }
  );
