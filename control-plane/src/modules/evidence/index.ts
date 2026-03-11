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
import { clickhouse as chClient } from "../../db/clickhouse";
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { apiResponse, paginatedResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { BundlesQueryParams, VerifyBundlesBody } from "./model";
import { EvidenceVerificationService } from "./service";

type EvidenceRouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
> = RouteContext<TBody, TQuery> & {
  evidenceService: EvidenceVerificationService;
};

export const evidenceModule = new Elysia({ prefix: "/api/v1/evidence" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive EvidenceVerificationService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    return {
      evidenceService: new EvidenceVerificationService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // POST /verify -- Verify evidence bundles (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .post(
    "/verify",
    async (ctx) => {
      const routeCtx = ctx as unknown as EvidenceRouteContext<{ bundle_ids: string[] }>;
      const results = await routeCtx.evidenceService.verifyBundles(routeCtx.body.bundle_ids);
      return apiResponse(results);
    },
    {
      auth: ["read_only_auditor"],
      body: VerifyBundlesBody,
    },
  )

  // ---------------------------------------------------------------------------
  // GET /bundles -- List evidence bundles with pagination (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/bundles",
    async (ctx) => {
      const routeCtx = ctx as unknown as EvidenceRouteContext<
        unknown,
        { cursor?: string; page_size?: number; from_date?: string; to_date?: string }
      >;
      const filters = {
        from_date: routeCtx.query.from_date,
        to_date: routeCtx.query.to_date,
      };

      const pageSize = routeCtx.query.page_size
        ? parseInt(String(routeCtx.query.page_size), 10)
        : undefined;

      const result = await routeCtx.evidenceService.listBundles(
        filters,
        routeCtx.query.cursor,
        pageSize,
        routeCtx.user.departmentIds,
      );

      return paginatedResponse(result.items, result.nextCursor, undefined);
    },
    {
      auth: ["read_only_auditor"],
      query: BundlesQueryParams,
    },
  );
