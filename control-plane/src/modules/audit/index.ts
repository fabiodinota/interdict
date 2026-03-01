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

export const auditModule = new Elysia({ prefix: "/api/v1/audit" })
  // ---------------------------------------------------------------------------
  // Derive AuditService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const ctx = store as { db: any; clickhouse: any };
    return {
      auditService: new AuditService(ctx.clickhouse, ctx.db),
    };
  })

  // ---------------------------------------------------------------------------
  // GET /search -- Main audit trail search endpoint
  // ---------------------------------------------------------------------------
  .get(
    "/search",
    async ({ query, auditService }) => {
      const filters = {
        vendor: query.vendor,
        department: query.department,
        actor_identity: query.actor,
        policy_action: query.policy_action,
        from_date: query.from_date,
        to_date: query.to_date,
        kernel_id: query.kernel_id,
      };

      const pageSize = query.page_size
        ? parseInt(String(query.page_size), 10)
        : undefined;

      const result = await auditService.search(
        filters,
        query.cursor,
        pageSize
      );

      return paginatedResponse(
        result.items,
        result.nextCursor,
        undefined
      );
    },
    {
      query: AuditQueryParams,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stream -- SSE streaming endpoint for real-time audit events
  // ---------------------------------------------------------------------------
  .get(
    "/stream",
    async function* ({ query, auditService }: any) {
      const pollIntervalMs = 2500; // Poll every 2.5 seconds
      let lastTimestamp = new Date().toISOString();

      const filters = {
        vendor: query.vendor,
        department: query.department,
        actor_identity: query.actor,
        policy_action: query.policy_action,
      };

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
          const events = await auditService.streamEvents(
            lastTimestamp,
            filters
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
  // GET /stats/violations -- Hourly violation time series
  // ---------------------------------------------------------------------------
  .get(
    "/stats/violations",
    async ({ query, auditService }) => {
      const data = await auditService.getHourlyViolations(
        query.from,
        query.to
      );
      return apiResponse(data);
    },
    {
      query: HourlyViolationsQuery,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stats/vendor-usage -- Vendor usage time series
  // ---------------------------------------------------------------------------
  .get(
    "/stats/vendor-usage",
    async ({ query, auditService }) => {
      const data = await auditService.getVendorUsage(
        query.from,
        query.to,
        query.vendor
      );
      return apiResponse(data);
    },
    {
      query: VendorUsageQuery,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /stats/department-summary -- Department summary time series
  // ---------------------------------------------------------------------------
  .get(
    "/stats/department-summary",
    async ({ query, auditService }) => {
      const data = await auditService.getDepartmentSummary(
        query.from,
        query.to,
        query.department
      );
      return apiResponse(data);
    },
    {
      query: DepartmentSummaryQuery,
    }
  );
