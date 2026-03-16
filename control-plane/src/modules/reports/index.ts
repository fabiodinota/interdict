/**
 * Reports Module - Elysia Plugin
 *
 * REST endpoint for generating compliance reports (PDF/CSV).
 * Prefix: /api/v1/reports
 */

import { Elysia, t } from "elysia";
import { clickhouse as chClient } from "../../db/clickhouse";
import { db as pgDb } from "../../db/postgres";
import type { AppStore, RouteContext } from "../../shared/types";
import { ValidationError } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { apiRateLimiter } from "../auth";
import { createRateLimitHook } from "../auth/rate-limiter";
import { generateCSV } from "./csv-generator";
import { generatePDF } from "./pdf-generator";
import { ReportService } from "./service";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type ReportRouteContext = RouteContext<{
  format: "pdf" | "csv";
  from_date: string;
  to_date: string;
}>;

export const reportsModule = new Elysia({ prefix: "/api/v1/reports" })
  .use(authPlugin)

  /**
   * POST /generate -- Generate a compliance report (Read-Only Auditor+)
   *
   * Body: { format: "pdf" | "csv", from_date: string, to_date: string }
   * Returns: binary download (PDF or CSV)
   */
  .post(
    "/generate",
    async (ctx) => {
      const routeCtx = ctx as unknown as ReportRouteContext;
      const { format, from_date, to_date } = routeCtx.body;

      // Validate date range
      const from = new Date(from_date);
      const to = new Date(to_date);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new ValidationError("Invalid date format. Use ISO 8601 dates.");
      }

      if (from >= to) {
        throw new ValidationError("from_date must be before to_date.");
      }

      if (to.getTime() - from.getTime() > ONE_YEAR_MS) {
        throw new ValidationError("Date range must not exceed 365 days.");
      }

      // Gather report data
      const store = routeCtx.store as unknown as Partial<AppStore>;
      const reportService = new ReportService(store.clickhouse ?? chClient, store.db ?? pgDb);
      const reportData = await reportService.getReportData(from_date, to_date);

      // Generate file
      const dateLabel = from.toISOString().split("T")[0];

      if (format === "pdf") {
        const pdfBuffer = await generatePDF(reportData);
        routeCtx.set.headers["Content-Type"] = "application/pdf";
        routeCtx.set.headers["Content-Disposition"] =
          `attachment; filename="interdict-report-${dateLabel}.pdf"`;
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="interdict-report-${dateLabel}.pdf"`,
          },
        });
      }

      // CSV
      const csvContent = generateCSV(reportData);
      return new Response(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="interdict-report-${dateLabel}.csv"`,
        },
      });
    },
    {
      auth: ["read_only_auditor"],
      body: t.Object({
        format: t.Union([t.Literal("pdf"), t.Literal("csv")]),
        from_date: t.String(),
        to_date: t.String(),
      }),
      beforeHandle: createRateLimitHook(apiRateLimiter),
    },
  );
