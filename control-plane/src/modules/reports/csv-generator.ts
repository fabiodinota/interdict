/**
 * CSV Report Generator
 *
 * Generates a structured CSV compliance report with multiple sections
 * separated by blank rows and section headers. Values are properly escaped.
 */

import type { ReportData } from "./service";

// ---------------------------------------------------------------------------
// CSV Escaping
// ---------------------------------------------------------------------------

/**
 * Escape a value for CSV output.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: Array<string | number | boolean | null | undefined>): string {
  return values.map(escapeCSV).join(",");
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateCSV(reportData: ReportData): string {
  const lines: string[] = [];

  // Header
  lines.push(csvRow(["Interdict Compliance Report"]));
  lines.push(
    csvRow([
      `Report Period: ${formatDate(reportData.dateRange.from)} - ${formatDate(reportData.dateRange.to)}`,
    ])
  );
  lines.push(csvRow([`Generated: ${formatDate(reportData.generatedAt)}`]));
  lines.push("");

  // --- Executive Summary ---
  lines.push(csvRow(["EXECUTIVE SUMMARY"]));
  lines.push(csvRow(["Metric", "Value"]));
  lines.push(csvRow(["Total Requests", reportData.summary.totalRequests]));
  lines.push(csvRow(["Total Violations", reportData.summary.totalViolations]));
  lines.push(csvRow(["Unique Actors", reportData.summary.uniqueActors]));
  lines.push(csvRow(["Unique Vendors", reportData.summary.uniqueVendors]));
  lines.push("");

  // --- Violations by Type ---
  lines.push(csvRow(["VIOLATIONS BY TYPE"]));
  lines.push(csvRow(["Action", "Count", "Percentage"]));
  const typeTotal = reportData.violationsByType.reduce((s, v) => s + v.count, 0);
  for (const row of reportData.violationsByType) {
    const pct = typeTotal > 0 ? ((row.count / typeTotal) * 100).toFixed(1) : "0";
    lines.push(csvRow([row.action, row.count, `${pct}%`]));
  }
  lines.push("");

  // --- Violations by Department ---
  lines.push(csvRow(["VIOLATIONS BY DEPARTMENT"]));
  lines.push(csvRow(["Department", "Violations"]));
  for (const row of reportData.violationsByDepartment) {
    lines.push(csvRow([row.department || "Unknown", row.count]));
  }
  lines.push("");

  // --- Violations by Vendor ---
  lines.push(csvRow(["VIOLATIONS BY VENDOR"]));
  lines.push(csvRow(["Vendor", "Violations"]));
  for (const row of reportData.violationsByVendor) {
    lines.push(csvRow([row.vendor, row.count]));
  }
  lines.push("");

  // --- Top 10 Incidents ---
  lines.push(csvRow(["TOP 10 INCIDENTS"]));
  lines.push(csvRow(["Timestamp", "Actor", "Vendor", "Model", "Action", "Token Count"]));
  for (const inc of reportData.topIncidents) {
    lines.push(
      csvRow([
        inc.timestamp,
        inc.actor,
        inc.vendor,
        inc.model,
        inc.action,
        inc.tokenCount,
      ])
    );
  }
  lines.push("");

  // --- Active Policies ---
  lines.push(csvRow(["ACTIVE POLICIES"]));
  lines.push(csvRow(["Policy Name", "Enabled", "Compilation Status"]));
  for (const p of reportData.activePolicies) {
    lines.push(csvRow([p.name, p.enabled ? "Yes" : "No", p.compilationStatus ?? "N/A"]));
  }
  lines.push("");

  // --- Vendor Approval Status ---
  lines.push(csvRow(["VENDOR APPROVAL STATUS"]));
  lines.push(csvRow(["Vendor", "Display Name", "Status", "Model Count"]));
  for (const v of reportData.vendorStatus) {
    lines.push(csvRow([v.name, v.displayName, v.status, v.modelCount]));
  }
  lines.push("");

  // --- Regulatory Frameworks ---
  lines.push(csvRow(["REGULATORY FRAMEWORKS"]));
  lines.push(csvRow(["Framework", "Jurisdiction", "Active Policies"]));
  for (const fw of reportData.activeFrameworks) {
    lines.push(csvRow([fw.name, fw.jurisdiction ?? "Global", fw.activePolicyCount]));
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
