/**
 * Audit Module - Elysia Plugin
 *
 * REST and SSE endpoints for audit trail search, real-time streaming,
 * and aggregate statistics from ClickHouse materialized views.
 *
 * Prefix: /api/v1/audit
 *
 * NOTE: This module is NOT wired into src/index.ts in this plan.
 * Module wiring is handled by Plan 05-05 (Wave 3 integration).
 */

import { Elysia, t } from "elysia";
import { AuditService } from "./service";
import {
  AuditQueryParams,
  HourlyViolationsQuery,
  VendorUsageQuery,
  DepartmentSummaryQuery,
} from "./model";
import {
  apiResponse,
  paginatedResponse,
} from "../../shared/utilities";
import type { AppStore, RouteContext } from "../../shared/types";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

type AuditRouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
> = RouteContext<TBody, TQuery> & { auditService: AuditService };

export const auditModule = new Elysia({ prefix: "/api/v1/audit" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive AuditService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    return {
      auditService: new AuditService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // GET /search -- Main audit trail search endpoint (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/search",
    async (ctx) => {
      const routeCtx = ctx as unknown as AuditRouteContext<
        unknown,
        {
          vendor?: string;
          department?: string;
          actor?: string;
          policy_action?: "allow" | "block" | "redact";
          from_date?: string;
          to_date?: string;
          kernel_id?: string;
          cursor?: string;
          page_size?: number;
        }
      >;
      const filters = {
        vendor: routeCtx.query.vendor,
        department: routeCtx.query.department,
        actor_identity: routeCtx.query.actor,
        policy_action: routeCtx.query.policy_action,
        from_date: routeCtx.query.from_date,
        to_date: routeCtx.query.to_date,
        kernel_id: routeCtx.query.kernel_id,
      };

      const pageSize = routeCtx.query.page_size
        ? parseInt(String(routeCtx.query.page_size), 10)
        : undefined;

      const result = await routeCtx.auditService.search(
        filters,
        routeCtx.query.cursor,
        pageSize,
        routeCtx.user.departmentIds
      );

      return paginatedResponse(
        result.items,
        result.nextCursor,
        undefined
      );
    },
    {
      auth: ["read_only_auditor"],
      query: AuditQueryParams,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stream -- SSE streaming endpoint for real-time audit events (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/stream",
    async function* (ctx) {
      const routeCtx = ctx as unknown as AuditRouteContext<
        unknown,
        {
          vendor?: string;
          department?: string;
          actor?: string;
          policy_action?: "allow" | "block" | "redact";
        }
      >;
      const pollIntervalMs = 2500; // Poll every 2.5 seconds
      let lastTimestamp = new Date().toISOString();

      const filters = {
        vendor: routeCtx.query.vendor,
        department: routeCtx.query.department,
        actor_identity: routeCtx.query.actor,
        policy_action: routeCtx.query.policy_action,
      };

      const departmentIds = routeCtx.user.departmentIds;

      // Yield initial connection event
      yield {
        event: "connected",
        data: JSON.stringify({
          message: "Audit stream connected",
          timestamp: lastTimestamp,
        }),
      };

      // Poll loop
      while (true) {
        try {
          const events = await routeCtx.auditService.streamEvents(
            lastTimestamp,
            filters,
            departmentIds
          );

          for (const event of events) {
            yield {
              event: "audit-event",
              data: JSON.stringify(event),
            };

            // Update high-water mark
            if (event.timestamp > lastTimestamp) {
              lastTimestamp = event.timestamp;
            }
          }
        } catch (err) {
          // Log but don't crash the stream
          console.error("[audit/stream] Poll error:", err);
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    },
    {
      auth: ["read_only_auditor"],
      query: t.Object({
        vendor: t.Optional(t.String()),
        department: t.Optional(t.String()),
        actor: t.Optional(t.String()),
        policy_action: t.Optional(
          t.Union([
            t.Literal("allow"),
            t.Literal("block"),
            t.Literal("redact"),
          ])
        ),
      }),
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stats/violations -- Hourly violation time series (Read-Only Auditor+)
  // Note: Per-department scoping deferred to Phase 11 advanced views
  // ---------------------------------------------------------------------------
  .get(
    "/stats/violations",
    async (ctx) => {
      const routeCtx = ctx as unknown as AuditRouteContext<unknown, { from: string; to: string }>;
      const data = await routeCtx.auditService.getHourlyViolations(
        routeCtx.query.from,
        routeCtx.query.to,
        routeCtx.user.departmentIds  // HIGH-011: scope to user's visible departments
      );
      return apiResponse(data);
    },
    {
      auth: ["read_only_auditor"],
      query: HourlyViolationsQuery,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stats/vendor-usage -- Vendor usage time series (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/stats/vendor-usage",
    async (ctx) => {
      const routeCtx = ctx as unknown as AuditRouteContext<unknown, { from: string; to: string; vendor?: string }>;
      const data = await routeCtx.auditService.getVendorUsage(
        routeCtx.query.from,
        routeCtx.query.to,
        routeCtx.query.vendor,
        routeCtx.user.departmentIds  // HIGH-011: scope to user's visible departments
      );
      return apiResponse(data);
    },
    {
      auth: ["read_only_auditor"],
      query: VendorUsageQuery,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stats/department-summary -- Department summary time series (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/stats/department-summary",
    async (ctx) => {
      const routeCtx = ctx as unknown as AuditRouteContext<
        unknown,
        { from: string; to: string; department?: string }
      >;
      const data = await routeCtx.auditService.getDepartmentSummary(
        routeCtx.query.from,
        routeCtx.query.to,
        routeCtx.query.department,
        routeCtx.user.departmentIds
      );
      return apiResponse(data);
    },
    {
      auth: ["read_only_auditor"],
      query: DepartmentSummaryQuery,
    }
  );
