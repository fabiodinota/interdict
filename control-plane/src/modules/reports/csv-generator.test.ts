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
import { escapeCSV, generateCSV } from "./csv-generator";
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
    activePolicies: [{ name: "PII Detection", enabled: true, compilationStatus: "compiled" }],
    vendorStatus: [{ name: "openai", displayName: "OpenAI", status: "approved", modelCount: 5 }],
    activeFrameworks: [{ name: "EU AI Act", jurisdiction: "EU", activePolicyCount: 3 }],
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

// ---------------------------------------------------------------------------
// escapeCSV — formula injection sanitization (direct unit tests)
// ---------------------------------------------------------------------------

describe("escapeCSV", () => {
  describe("formula injection defense", () => {
    it('sanitizes = prefix: =CMD("calc") becomes "\'=CMD(""calc"")"', () => {
      expect(escapeCSV('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`);
    });

    it('sanitizes + prefix: +1-1 becomes "\'+1-1"', () => {
      expect(escapeCSV("+1-1")).toBe(`"'+1-1"`);
    });

    it('sanitizes @ prefix: @SUM(A1:A10) becomes "\'@SUM(A1:A10)"', () => {
      expect(escapeCSV("@SUM(A1:A10)")).toBe(`"'@SUM(A1:A10)"`);
    });

    it('sanitizes - prefix: -1+1 becomes "\'-1+1"', () => {
      expect(escapeCSV("-1+1")).toBe(`"'-1+1"`);
    });

    it("sanitizes formula prefix even when value also contains commas", () => {
      expect(escapeCSV("=A1,B2")).toBe(`"'=A1,B2"`);
    });

    it("sanitizes formula prefix even when value also contains quotes", () => {
      expect(escapeCSV('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    });

    it("sanitizes formula prefix with newlines in value", () => {
      expect(escapeCSV("=A1\nB2")).toBe(`"'=A1\nB2"`);
    });
  });

  describe("normal values unchanged", () => {
    it("leaves plain strings unchanged", () => {
      expect(escapeCSV("hello")).toBe("hello");
    });

    it("leaves numbers unchanged", () => {
      expect(escapeCSV(42)).toBe("42");
    });

    it("leaves negative numbers as-is (stringified by String())", () => {
      // Number -1 becomes the string "-1" which starts with "-",
      // but this is fine — CSV formula injection is a string-input concern.
      // When a number is passed, String(-1) = "-1" which does start with "-",
      // so it will be sanitized. This is the safe default — fail-closed.
      const result = escapeCSV(-1);
      expect(result).toBe(`"'-1"`);
    });

    it("returns empty string for null", () => {
      expect(escapeCSV(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(escapeCSV(undefined)).toBe("");
    });

    it("handles booleans", () => {
      expect(escapeCSV(true)).toBe("true");
      expect(escapeCSV(false)).toBe("false");
    });

    it("handles empty string", () => {
      expect(escapeCSV("")).toBe("");
    });
  });

  describe("standard CSV escaping still works", () => {
    it("wraps comma-containing strings in quotes", () => {
      expect(escapeCSV("a,b")).toBe('"a,b"');
    });

    it("escapes double quotes by doubling them", () => {
      expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
    });

    it("wraps newline-containing strings in quotes", () => {
      expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
    });

    it("wraps carriage-return-containing strings in quotes", () => {
      expect(escapeCSV("line1\rline2")).toBe('"line1\rline2"');
    });
  });
});

// ---------------------------------------------------------------------------
// Formula injection via generateCSV (integration-level)
// ---------------------------------------------------------------------------

describe("generateCSV — formula injection in data fields", () => {
  it("sanitizes formula-prefixed vendor names", () => {
    const data = createMinimalReportData({
      violationsByVendor: [{ vendor: '=CMD("calc")', count: 1 }],
    });
    const csv = generateCSV(data);

    // The vendor name must be neutralized
    expect(csv).toContain("'=CMD");
    expect(csv).not.toMatch(/(?<!"')=CMD/); // no bare =CMD without leading '
  });

  it("sanitizes formula-prefixed department names", () => {
    const data = createMinimalReportData({
      violationsByDepartment: [{ department: "+1-1", count: 1 }],
    });
    const csv = generateCSV(data);

    expect(csv).toContain("'+1-1");
  });

  it("sanitizes formula-prefixed policy names", () => {
    const data = createMinimalReportData({
      activePolicies: [{ name: "@SUM(A1:A10)", enabled: true, compilationStatus: "compiled" }],
    });
    const csv = generateCSV(data);

    expect(csv).toContain("'@SUM");
  });
});
