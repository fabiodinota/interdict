/**
 * Report Service Tests (Phase 18)
 *
 * Verifies that:
 * - Section failures produce warnings, not silent zeros
 * - Report data includes warnings array
 * - Partial failures don't crash report generation
 */

import { describe, expect, it } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { AppDb } from "../../shared/types";
import { ReportService } from "./service";

type MockClickHouseClient = {
  query: (opts: {
    query: string;
    format?: string;
    query_params?: Record<string, unknown>;
  }) => Promise<{ json: () => Promise<unknown[]> }>;
};

type EmptyQueryChain = Promise<unknown[]> & {
  from: () => EmptyQueryChain;
  where: () => EmptyQueryChain;
  orderBy: () => EmptyQueryChain;
  groupBy: () => EmptyQueryChain;
  leftJoin: () => EmptyQueryChain;
  innerJoin: () => EmptyQueryChain;
  limit: () => EmptyQueryChain;
};

function createEmptyQueryChain(): EmptyQueryChain {
  const chain = Promise.resolve([] as unknown[]) as EmptyQueryChain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.groupBy = () => chain;
  chain.leftJoin = () => chain;
  chain.innerJoin = () => chain;
  chain.limit = () => chain;

  return chain;
}

// ---------------------------------------------------------------------------
// Mock ClickHouse client that always fails
// ---------------------------------------------------------------------------

const failingClickhouse: MockClickHouseClient = {
  query: () => {
    throw new Error("ClickHouse connection refused");
  },
};

// ---------------------------------------------------------------------------
// Mock ClickHouse client that returns empty results
// ---------------------------------------------------------------------------

const emptyClickhouse: MockClickHouseClient = {
  query: async () => ({
    json: async () => [],
  }),
};

// ---------------------------------------------------------------------------
// Mock DB that always fails
// ---------------------------------------------------------------------------

const failingDb = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error("Postgres connection refused");
      };
    },
  },
) as unknown as AppDb;

// ---------------------------------------------------------------------------
// Mock DB that returns empty arrays for any chained query
// ---------------------------------------------------------------------------

function createEmptyDb() {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return (..._args: unknown[]) => createEmptyQueryChain();
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
      const service = new ReportService(
        failingClickhouse as ClickHouseClient,
        createEmptyDb() as unknown as AppDb,
      );
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // Should have warnings for the 5 CH sections
      expect(report.warnings.length).toBeGreaterThanOrEqual(1);

      // Failed sections should be null
      const chSections = [
        "summary",
        "violationsByType",
        "violationsByDepartment",
        "violationsByVendor",
        "topIncidents",
      ];
      for (const section of chSections) {
        const warning = report.warnings.find((w) => w.section === section);
        expect(warning).toBeDefined();
        expect(warning?.message).toContain("ClickHouse connection refused");
      }

      // CH data sections should be null
      expect(report.summary).toBeNull();
      expect(report.violationsByType).toBeNull();
      expect(report.violationsByDepartment).toBeNull();
      expect(report.violationsByVendor).toBeNull();
      expect(report.topIncidents).toBeNull();
    });

    it("surfaces Postgres failures as warnings, not silent empties", async () => {
      const service = new ReportService(emptyClickhouse as ClickHouseClient, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // Should have warnings for the 3 PG sections
      const pgSections = ["activePolicies", "vendorStatus", "activeFrameworks"];
      for (const section of pgSections) {
        const warning = report.warnings.find((w) => w.section === section);
        expect(warning).toBeDefined();
        expect(warning?.message).toContain("Postgres connection refused");
      }

      // PG data sections should be null
      expect(report.activePolicies).toBeNull();
      expect(report.vendorStatus).toBeNull();
      expect(report.activeFrameworks).toBeNull();
    });

    it("preserves successful sections when others fail", async () => {
      // CH works, PG fails
      const service = new ReportService(emptyClickhouse as ClickHouseClient, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      // CH sections succeed (with empty data from empty clickhouse)
      expect(report.summary).not.toBeNull();
      expect(report.violationsByType).not.toBeNull();

      // PG sections fail
      expect(report.activePolicies).toBeNull();
    });

    it("includes dateRange and generatedAt even on total failure", async () => {
      const service = new ReportService(failingClickhouse as ClickHouseClient, failingDb);
      const report = await service.getReportData("2026-01-01", "2026-01-31");

      expect(report.dateRange.from).toBe("2026-01-01");
      expect(report.dateRange.to).toBe("2026-01-31");
      expect(report.generatedAt).toBeTruthy();
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });
});
