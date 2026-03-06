/**
 * Reports Module - Elysia Plugin
 *
 * REST endpoint for generating compliance reports (PDF/CSV).
 * Prefix: /api/v1/reports
 */

import { Elysia, t } from "elysia";
import { ReportService } from "./service";
import { generatePDF } from "./pdf-generator";
import { generateCSV } from "./csv-generator";
import { ValidationError } from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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
    async (ctx: any) => {
      const { format, from_date, to_date } = ctx.body;

      // Validate date range
      const from = new Date(from_date);
      const to = new Date(to_date);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        throw new ValidationError("Invalid date format. Use ISO 8601 dates.");
      }

      if (from >= to) {
        throw new ValidationError("from_date must be before to_date.");
      }

      if (to.getTime() - from.getTime() > ONE_YEAR_MS) {
        throw new ValidationError("Date range must not exceed 365 days.");
      }

      // Gather report data
      const store = ctx.store as { db: any; clickhouse: any };
      const reportService = new ReportService(store.clickhouse ?? chClient, store.db ?? pgDb);
      const reportData = await reportService.getReportData(from_date, to_date);

      // Generate file
      const dateLabel = from.toISOString().split("T")[0];

      if (format === "pdf") {
        const pdfBuffer = await generatePDF(reportData);
        ctx.set.headers["Content-Type"] = "application/pdf";
        ctx.set.headers["Content-Disposition"] =
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
    }
  );
