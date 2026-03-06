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
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

export const auditModule = new Elysia({ prefix: "/api/v1/audit" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive AuditService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as { db: any; clickhouse: any };
    return {
      auditService: new AuditService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // GET /search -- Main audit trail search endpoint (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/search",
    async (ctx: any) => {
      const filters = {
        vendor: ctx.query.vendor,
        department: ctx.query.department,
        actor_identity: ctx.query.actor,
        policy_action: ctx.query.policy_action,
        from_date: ctx.query.from_date,
        to_date: ctx.query.to_date,
        kernel_id: ctx.query.kernel_id,
      };

      const pageSize = ctx.query.page_size
        ? parseInt(String(ctx.query.page_size), 10)
        : undefined;

      const result = await ctx.auditService.search(
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
      query: AuditQueryParams,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stream -- SSE streaming endpoint for real-time audit events (Read-Only Auditor+)
  // ---------------------------------------------------------------------------
  .get(
    "/stream",
    async function* (ctx: any) {
      const pollIntervalMs = 2500; // Poll every 2.5 seconds
      let lastTimestamp = new Date().toISOString();

      const filters = {
        vendor: ctx.query.vendor,
        department: ctx.query.department,
        actor_identity: ctx.query.actor,
        policy_action: ctx.query.policy_action,
      };

      const departmentIds = ctx.user.departmentIds;

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
          const events = await ctx.auditService.streamEvents(
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
    async (ctx: any) => {
      const data = await ctx.auditService.getHourlyViolations(
        ctx.query.from,
        ctx.query.to
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
  // Note: Per-department scoping deferred to Phase 11 advanced views
  // ---------------------------------------------------------------------------
  .get(
    "/stats/vendor-usage",
    async (ctx: any) => {
      const data = await ctx.auditService.getVendorUsage(
        ctx.query.from,
        ctx.query.to,
        ctx.query.vendor
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
    async (ctx: any) => {
      const data = await ctx.auditService.getDepartmentSummary(
        ctx.query.from,
        ctx.query.to,
        ctx.query.department,
        ctx.user.departmentIds
      );
      return apiResponse(data);
    },
    {
      auth: ["read_only_auditor"],
      query: DepartmentSummaryQuery,
    }
  );
