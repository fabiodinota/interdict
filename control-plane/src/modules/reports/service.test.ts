/**
 * Report Service Tests (Phase 18)
 *
 * Verifies that:
 * - Section failures produce warnings, not silent zeros
 * - Report data includes warnings array
 * - Partial failures don't crash report generation
 */

import { describe, it, expect } from "bun:test";
import { ReportService, type ReportData, type ReportWarning } from "./service";

// ---------------------------------------------------------------------------
// Mock ClickHouse client that always fails
// ---------------------------------------------------------------------------

const failingClickhouse: any = {
  query: () => { throw new Error("ClickHouse connection refused"); },
};

// ---------------------------------------------------------------------------
// Mock ClickHouse client that returns empty results
// ---------------------------------------------------------------------------

const emptyClickhouse: any = {
  query: async () => ({
    json: async () => [],
  }),
};

// ---------------------------------------------------------------------------
// Mock DB that always fails
// ---------------------------------------------------------------------------

const failingDb: any = new Proxy({}, {
  get() {
    return () => { throw new Error("Postgres connection refused"); };
  },
});

// ---------------------------------------------------------------------------
// Mock DB that returns empty arrays for any chained query
// ---------------------------------------------------------------------------

function createEmptyDb() {
  const chainable: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return undefined; // not a thenable
      return (..._args: any[]) => chainable;
    },
  });
  // Override the terminal .from() to return a promise of empty array
  const handler: any = {
    get(_target: any, prop: string) {
      if (prop === "then") return undefined;
      return (..._args: any[]) => {
        // select(), from(), where(), etc. all return a thenable empty array
        const inner: any = new Proxy([], {
          get(target, p) {
            if (p === "then") return (target as any).then.bind(target);
            if (p === "map") return (target as any).map.bind(target);
            if (p === "length") return 0;
            if (typeof p === "string") {
              return (..._a: any[]) => inner;
            }
            return (target as any)[p];
          },
        });
        // Make it also act as an awaitable empty array
        return Object.assign(Promise.resolve([]), {
          from: () => Promise.resolve([]),
          where: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
          groupBy: () => Promise.resolve([]),
          leftJoin: () => Promise.resolve([]),
          innerJoin: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
        });
      };
    },
  };
  return new Proxy({}, handler);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReportService", () => {
  describe("failure surfacing (Phase 18)", () => {
    it("surfaces ClickHouse failures as warnings, not silent zeros", async () => {
      const service = new ReportService(failingClickhouse, createEmptyDb());
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // Should have warnings for the 5 CH sections
      expect(report.warnings.length).toBeGreaterThanOrEqual(1);

      // Failed sections should be null
      const chSections = ["summary", "violationsByType", "violationsByDepartment", "violationsByVendor", "topIncidents"];
      for (const section of chSections) {
        const warning = report.warnings.find((w) => w.section === section);
        expect(warning).toBeDefined();
        expect(warning!.message).toContain("ClickHouse connection refused");
      }

      // CH data sections should be null
      expect(report.summary).toBeNull();
      expect(report.violationsByType).toBeNull();
      expect(report.violationsByDepartment).toBeNull();
      expect(report.violationsByVendor).toBeNull();
      expect(report.topIncidents).toBeNull();
    });

    it("surfaces Postgres failures as warnings, not silent empties", async () => {
      const service = new ReportService(emptyClickhouse, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // Should have warnings for the 3 PG sections
      const pgSections = ["activePolicies", "vendorStatus", "activeFrameworks"];
      for (const section of pgSections) {
        const warning = report.warnings.find((w) => w.section === section);
        expect(warning).toBeDefined();
        expect(warning!.message).toContain("Postgres connection refused");
      }

      // PG data sections should be null
      expect(report.activePolicies).toBeNull();
      expect(report.vendorStatus).toBeNull();
      expect(report.activeFrameworks).toBeNull();
    });

    it("preserves successful sections when others fail", async () => {
      // CH works, PG fails
      const service = new ReportService(emptyClickhouse, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // CH sections succeed (with empty data from empty clickhouse)
      expect(report.summary).not.toBeNull();
      expect(report.violationsByType).not.toBeNull();

      // PG sections fail
      expect(report.activePolicies).toBeNull();
    });

    it("includes dateRange and generatedAt even on total failure", async () => {
      const service = new ReportService(failingClickhouse, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      expect(report.dateRange.from).toBe("2026-01-01");
      expect(report.dateRange.to).toBe("2026-01-31");
      expect(report.generatedAt).toBeTruthy();
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });
});
