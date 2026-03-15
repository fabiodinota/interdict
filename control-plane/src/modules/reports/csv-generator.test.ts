/**
 * CSV Generator Tests
 *
 * Tests escapeCSV() with special characters and generateCSV() with
 * minimal ReportData producing correct CSV structure.
 *
 * Note: escapeCSV and csvRow are not exported, so we test them indirectly
 * through generateCSV output and verify correct escaping in the output.
 */

import { describe, expect, it } from "bun:test";
import { generateCSV } from "./csv-generator";
import type { ReportData } from "./service";

// ---------------------------------------------------------------------------
// Minimal ReportData factory
// ---------------------------------------------------------------------------

function createMinimalReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    dateRange: { from: "2025-01-01T00:00:00Z", to: "2025-01-31T23:59:59Z" },
    generatedAt: "2025-02-01T12:00:00Z",
    warnings: [],
    summary: {
      totalRequests: 1000,
      totalViolations: 50,
      uniqueActors: 10,
      uniqueVendors: 3,
    },
    violationsByType: [
      { action: "block", count: 30 },
      { action: "redact", count: 20 },
    ],
    violationsByDepartment: [{ department: "Engineering", count: 40 }],
    violationsByVendor: [{ vendor: "openai", count: 35 }],
    topIncidents: [
      {
        timestamp: "2025-01-15T10:00:00Z",
        actor: "alice",
        vendor: "openai",
        model: "gpt-4",
        action: "block",
        tokenCount: 5000,
      },
    ],
    activePolicies: [
      { name: "PII Detection", enabled: true, compilationStatus: "compiled" },
    ],
    vendorStatus: [
      { name: "openai", displayName: "OpenAI", status: "approved", modelCount: 5 },
    ],
    activeFrameworks: [
      { name: "EU AI Act", jurisdiction: "EU", activePolicyCount: 3 },
    ],
    ...overrides,
  };
}

describe("generateCSV", () => {
  // -----------------------------------------------------------------------
  // Basic structure
  // -----------------------------------------------------------------------
  describe("structure", () => {
    it("produces CSV with all section headers", () => {
      const data = createMinimalReportData();
      const csv = generateCSV(data);

      expect(csv).toContain("Interdict Compliance Report");
      expect(csv).toContain("EXECUTIVE SUMMARY");
      expect(csv).toContain("VIOLATIONS BY TYPE");
      expect(csv).toContain("VIOLATIONS BY DEPARTMENT");
      expect(csv).toContain("VIOLATIONS BY VENDOR");
      expect(csv).toContain("TOP 10 INCIDENTS");
      expect(csv).toContain("ACTIVE POLICIES");
      expect(csv).toContain("VENDOR APPROVAL STATUS");
      expect(csv).toContain("REGULATORY FRAMEWORKS");
    });

    it("includes report period and generated date in header", () => {
      const data = createMinimalReportData();
      const csv = generateCSV(data);

      expect(csv).toContain("Report Period:");
      expect(csv).toContain("Generated:");
    });

    it("includes summary metric values", () => {
      const data = createMinimalReportData();
      const csv = generateCSV(data);

      expect(csv).toContain("Total Requests,1000");
      expect(csv).toContain("Total Violations,50");
      expect(csv).toContain("Unique Actors,10");
      expect(csv).toContain("Unique Vendors,3");
    });
  });

  // -----------------------------------------------------------------------
  // CSV escaping (tested via generateCSV output)
  // -----------------------------------------------------------------------
  describe("escaping", () => {
    it("escapes commas in values by wrapping in quotes", () => {
      const data = createMinimalReportData({
        violationsByDepartment: [{ department: "Engineering, Research", count: 10 }],
      });
      const csv = generateCSV(data);

      // Value with comma should be quoted
      expect(csv).toContain('"Engineering, Research"');
    });

    it("escapes double quotes by doubling them", () => {
      const data = createMinimalReportData({
        violationsByDepartment: [{ department: 'The "Special" Department', count: 5 }],
      });
      const csv = generateCSV(data);

      // Double quotes should be escaped as ""
      expect(csv).toContain('"The ""Special"" Department"');
    });

    it("escapes newlines in values", () => {
      const data = createMinimalReportData({
        violationsByDepartment: [{ department: "Line1\nLine2", count: 3 }],
      });
      const csv = generateCSV(data);

      // Newline should trigger quoting
      expect(csv).toContain('"Line1\nLine2"');
    });

    it("handles null values as empty strings", () => {
      const data = createMinimalReportData({
        violationsByDepartment: [{ department: "", count: 7 }],
      });
      const csv = generateCSV(data);

      // null/empty department maps to "Unknown" in the code
      expect(csv).toContain("Unknown");
    });
  });

  // -----------------------------------------------------------------------
  // Null/unavailable sections
  // -----------------------------------------------------------------------
  describe("unavailable sections", () => {
    it("shows DATA UNAVAILABLE when summary is null", () => {
      const data = createMinimalReportData({ summary: null });
      const csv = generateCSV(data);

      expect(csv).toContain("DATA UNAVAILABLE");
    });

    it("shows DATA UNAVAILABLE when violationsByType is null", () => {
      const data = createMinimalReportData({ violationsByType: null });
      const csv = generateCSV(data);

      expect(csv).toContain("DATA UNAVAILABLE");
    });

    it("includes warnings section when warnings present", () => {
      const data = createMinimalReportData({
        warnings: [{ section: "summary", message: "Connection refused" }],
      });
      const csv = generateCSV(data);

      expect(csv).toContain("DATA AVAILABILITY WARNINGS");
      expect(csv).toContain("summary");
      expect(csv).toContain("Connection refused");
    });
  });

  // -----------------------------------------------------------------------
  // Violation percentage calculation
  // -----------------------------------------------------------------------
  describe("percentages", () => {
    it("calculates correct violation type percentages", () => {
      const data = createMinimalReportData({
        violationsByType: [
          { action: "block", count: 75 },
          { action: "redact", count: 25 },
        ],
      });
      const csv = generateCSV(data);

      expect(csv).toContain("75.0%");
      expect(csv).toContain("25.0%");
    });
  });

  // -----------------------------------------------------------------------
  // Active policies formatting
  // -----------------------------------------------------------------------
  describe("policies", () => {
    it("formats enabled policies as Yes", () => {
      const data = createMinimalReportData({
        activePolicies: [{ name: "Test Policy", enabled: true, compilationStatus: "compiled" }],
      });
      const csv = generateCSV(data);

      expect(csv).toContain("Test Policy,Yes,compiled");
    });

    it("formats disabled policies as No", () => {
      const data = createMinimalReportData({
        activePolicies: [{ name: "Disabled Policy", enabled: false, compilationStatus: "pending" }],
      });
      const csv = generateCSV(data);

      expect(csv).toContain("Disabled Policy,No,pending");
    });
  });

  // -----------------------------------------------------------------------
  // Empty data
  // -----------------------------------------------------------------------
  describe("empty data", () => {
    it("generates valid CSV with empty arrays", () => {
      const data = createMinimalReportData({
        violationsByType: [],
        violationsByDepartment: [],
        violationsByVendor: [],
        topIncidents: [],
        activePolicies: [],
        vendorStatus: [],
        activeFrameworks: [],
      });
      const csv = generateCSV(data);

      // Should still have headers, just no data rows
      expect(csv).toContain("EXECUTIVE SUMMARY");
      expect(csv).toContain("VIOLATIONS BY TYPE");
      // Should not crash
      expect(csv.length).toBeGreaterThan(0);
    });
  });
});
