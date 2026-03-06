/**
 * Evidence Module - Elysia Plugin
 *
 * REST endpoints for evidence bundle verification and listing.
 *
 * Prefix: /api/v1/evidence
 *
 * Endpoints:
 * - POST /verify  -- Verify evidence bundles (three-step cryptographic check)
 * - GET  /bundles -- List evidence bundles with pagination and department scoping
 */

import { Elysia } from "elysia";
import { EvidenceVerificationService } from "./service";
import { VerifyBundlesBody, BundlesQueryParams } from "./model";
import { apiResponse, paginatedResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

export const evidenceModule = new Elysia({ prefix: "/api/v1/evidence" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive EvidenceVerificationService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as { db: any; clickhouse: any };
    return {
      evidenceService: new EvidenceVerificationService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // POST /verify -- Verify evidence bundles (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .post(
    "/verify",
    async (ctx: any) => {
      const results = await ctx.evidenceService.verifyBundles(
        ctx.body.bundle_ids
      );
      return apiResponse(results);
    },
    {
      auth: ["read_only_auditor"],
      body: VerifyBundlesBody,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /bundles -- List evidence bundles with pagination (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/bundles",
    async (ctx: any) => {
      const filters = {
        from_date: ctx.query.from_date,
        to_date: ctx.query.to_date,
      };

      const pageSize = ctx.query.page_size
        ? parseInt(String(ctx.query.page_size), 10)
        : undefined;

      const result = await ctx.evidenceService.listBundles(
        filters,
        ctx.query.cursor,
        pageSize,
        ctx.user.departmentIds
      );

      return paginatedResponse(
        result.items,
        result.nextCursor,
        undefined
      );
    },
    {
      auth: ["read_only_auditor"],
      query: BundlesQueryParams,
    }
  );
