/**
 * Anomalies Module - Elysia Plugin
 *
 * REST endpoints for anomaly detection alerts and summary statistics.
 *
 * Prefix: /api/v1/anomalies
 *
 * Auth: compliance_officer minimum for all endpoints.
 */

import { Elysia } from "elysia";
import { AnomalyService } from "./service";
import { AnomalyQueryParams } from "./model";
import { apiResponse } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { clickhouse as chClient } from "../../db/clickhouse";

export const anomaliesModule = new Elysia({ prefix: "/api/v1/anomalies" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive AnomalyService from decorated clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as { clickhouse: any };
    return {
      anomalyService: new AnomalyService(s.clickhouse ?? chClient),
    };
  })

  // ---------------------------------------------------------------------------
  // GET / -- All anomaly alerts (Compliance Officer+)
  // ---------------------------------------------------------------------------
  .get(
    "/",
    async (ctx: any) => {
      const alerts = await ctx.anomalyService.detectAnomalies();

      // Optional severity filter
      const severityFilter = ctx.query.severity;
      const filtered = severityFilter
        ? alerts.filter((a: any) => a.severity === severityFilter)
        : alerts;

      return apiResponse(filtered);
    },
    {
      auth: ["compliance_officer"],
      query: AnomalyQueryParams,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /summary -- Summary counts by severity and type (Compliance Officer+)
  // ---------------------------------------------------------------------------
  .get(
    "/summary",
    async (ctx: any) => {
      const summary = await ctx.anomalyService.getSummary();
      return apiResponse(summary);
    },
    {
      auth: ["compliance_officer"],
    }
  );
