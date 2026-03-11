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
import type { AppStore, RouteContext } from "../../shared/types";
import type { AnomalyAlert } from "./model";

type AnomalyRouteContext<
  TBody = unknown,
  TQuery = Record<string, string | undefined>,
> = RouteContext<TBody, TQuery> & { anomalyService: AnomalyService };

export const anomaliesModule = new Elysia({ prefix: "/api/v1/anomalies" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive AnomalyService from decorated clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    return {
      anomalyService: new AnomalyService(s.clickhouse ?? chClient),
    };
  })

  // ---------------------------------------------------------------------------
  // GET / -- All anomaly alerts (Compliance Officer+)
  // ---------------------------------------------------------------------------
  .get(
    "/",
    async (ctx) => {
      const routeCtx = ctx as unknown as AnomalyRouteContext<
        unknown,
        { severity?: AnomalyAlert["severity"] }
      >;
      const result = await routeCtx.anomalyService.detectAnomalies();

      // Optional severity filter
      const severityFilter = routeCtx.query.severity;
      const filtered = severityFilter
        ? result.alerts.filter((alert) => alert.severity === severityFilter)
        : result.alerts;

      return apiResponse(
        filtered,
        result.warnings.length > 0 ? { warnings: result.warnings } : undefined
      );
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
    async (ctx) => {
      const routeCtx = ctx as unknown as AnomalyRouteContext;
      const summary = await routeCtx.anomalyService.getSummary();
      return apiResponse(summary);
    },
    {
      auth: ["compliance_officer"],
    }
  );
