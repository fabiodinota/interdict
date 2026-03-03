/**
 * Report Service
 *
 * Gathers report data from ClickHouse (audit metrics) and PostgreSQL
 * (policies, vendors, frameworks) for compliance report generation.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { eq } from "drizzle-orm";
import {
  policies,
  policyVersions,
} from "../../db/schema/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportData {
  dateRange: { from: string; to: string };
  generatedAt: string;

  // Summary stats
  summary: {
    totalRequests: number;
    totalViolations: number;
    uniqueActors: number;
    uniqueVendors: number;
  };

  // Violations by type
  violationsByType: Array<{
    action: string;
    count: number;
  }>;

  // Violations by department
  violationsByDepartment: Array<{
    department: string;
    count: number;
  }>;

  // Violations by vendor
  violationsByVendor: Array<{
    vendor: string;
    count: number;
  }>;

  // Top 10 incidents (most severe)
  topIncidents: Array<{
    timestamp: string;
    actor: string;
    vendor: string;
    model: string;
    action: string;
    tokenCount: number;
  }>;

  // Active policies
  activePolicies: Array<{
    name: string;
    enabled: boolean;
    compilationStatus: string | null;
  }>;

  // Vendor approval status
  vendorStatus: Array<{
    name: string;
    displayName: string;
    status: string;
    modelCount: number;
  }>;

  // Active regulatory frameworks
  activeFrameworks: Array<{
    name: string;
    jurisdiction: string | null;
    activePolicyCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReportService {
  private clickhouse: ClickHouseClient;
  private db: any;

  constructor(clickhouse: ClickHouseClient, db: any) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  async getReportData(fromDate: string, toDate: string): Promise<ReportData> {
    const [
      summaryData,
      violationsByType,
      violationsByDepartment,
      violationsByVendor,
      topIncidents,
      activePoliciesList,
      vendorStatusList,
      activeFrameworksList,
    ] = await Promise.all([
      this.getSummaryStats(fromDate, toDate),
      this.getViolationsByType(fromDate, toDate),
      this.getViolationsByDepartment(fromDate, toDate),
      this.getViolationsByVendor(fromDate, toDate),
      this.getTopIncidents(fromDate, toDate),
      this.getActivePolicies(),
      this.getVendorStatus(),
      this.getActiveFrameworks(),
    ]);

    return {
      dateRange: { from: fromDate, to: toDate },
      generatedAt: new Date().toISOString(),
      summary: summaryData,
      violationsByType,
      violationsByDepartment,
      violationsByVendor,
      topIncidents,
      activePolicies: activePoliciesList,
      vendorStatus: vendorStatusList,
      activeFrameworks: activeFrameworksList,
    };
  }

  private async getSummaryStats(from: string, to: string) {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT
            count() as total_requests,
            countIf(policy_action IN ('block', 'redact')) as total_violations,
            uniq(actor_identity) as unique_actors,
            uniq(vendor) as unique_vendors
          FROM evidence_bundles
          WHERE timestamp >= {from:String} AND timestamp <= {to:String}
        `,
        query_params: { from, to },
        format: "JSONEachRow",
      });
      const rows: any[] = await result.json();
      if (rows.length > 0) {
        return {
          totalRequests: Number(rows[0].total_requests) || 0,
          totalViolations: Number(rows[0].total_violations) || 0,
          uniqueActors: Number(rows[0].unique_actors) || 0,
          uniqueVendors: Number(rows[0].unique_vendors) || 0,
        };
      }
    } catch (err) {
      console.error("[reports] Failed to query summary stats:", err);
    }
    return { totalRequests: 0, totalViolations: 0, uniqueActors: 0, uniqueVendors: 0 };
  }

  private async getViolationsByType(from: string, to: string) {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT policy_action as action, count() as count
          FROM evidence_bundles
          WHERE timestamp >= {from:String} AND timestamp <= {to:String}
          GROUP BY policy_action
          ORDER BY count DESC
        `,
        query_params: { from, to },
        format: "JSONEachRow",
      });
      const rows: any[] = await result.json();
      return rows.map((r) => ({ action: r.action, count: Number(r.count) }));
    } catch (err) {
      console.error("[reports] Failed to query violations by type:", err);
      return [];
    }
  }

  private async getViolationsByDepartment(from: string, to: string) {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT department, count() as count
          FROM evidence_bundles
          WHERE timestamp >= {from:String} AND timestamp <= {to:String}
            AND policy_action IN ('block', 'redact')
          GROUP BY department
          ORDER BY count DESC
          LIMIT 20
        `,
        query_params: { from, to },
        format: "JSONEachRow",
      });
      const rows: any[] = await result.json();
      return rows.map((r) => ({ department: r.department, count: Number(r.count) }));
    } catch (err) {
      console.error("[reports] Failed to query violations by department:", err);
      return [];
    }
  }

  private async getViolationsByVendor(from: string, to: string) {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT vendor, count() as count
          FROM evidence_bundles
          WHERE timestamp >= {from:String} AND timestamp <= {to:String}
            AND policy_action IN ('block', 'redact')
          GROUP BY vendor
          ORDER BY count DESC
          LIMIT 20
        `,
        query_params: { from, to },
        format: "JSONEachRow",
      });
      const rows: any[] = await result.json();
      return rows.map((r) => ({ vendor: r.vendor, count: Number(r.count) }));
    } catch (err) {
      console.error("[reports] Failed to query violations by vendor:", err);
      return [];
    }
  }

  private async getTopIncidents(from: string, to: string) {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT
            timestamp,
            actor_identity as actor,
            vendor,
            model,
            policy_action as action,
            token_count as tokenCount
          FROM evidence_bundles
          WHERE timestamp >= {from:String} AND timestamp <= {to:String}
            AND policy_action IN ('block', 'redact')
          ORDER BY timestamp DESC
          LIMIT 10
        `,
        query_params: { from, to },
        format: "JSONEachRow",
      });
      const rows: any[] = await result.json();
      return rows.map((r) => ({
        timestamp: r.timestamp,
        actor: r.actor,
        vendor: r.vendor,
        model: r.model,
        action: r.action,
        tokenCount: Number(r.tokenCount) || 0,
      }));
    } catch (err) {
      console.error("[reports] Failed to query top incidents:", err);
      return [];
    }
  }

  private async getActivePolicies() {
    try {
      const allPolicies = await this.db
        .select({
          name: policies.name,
          isActive: policies.isActive,
          currentVersionId: policies.currentVersionId,
        })
        .from(policies)
        .orderBy(policies.name);

      const result = await Promise.all(
        allPolicies.map(async (p: any) => {
          let compilationStatus: string | null = null;
          if (p.currentVersionId) {
            const vRows = await this.db
              .select({ compilationStatus: policyVersions.compilationStatus })
              .from(policyVersions)
              .where(eq(policyVersions.id, p.currentVersionId))
              .limit(1);
            if (vRows.length > 0) {
              compilationStatus = vRows[0].compilationStatus;
            }
          }
          return {
            name: p.name,
            enabled: p.isActive,
            compilationStatus,
          };
        })
      );
      return result;
    } catch (err) {
      console.error("[reports] Failed to query active policies:", err);
      return [];
    }
  }

  private async getVendorStatus() {
    try {
      // Import vendor tables dynamically to avoid circular deps
      const { vendors, vendorModels } = await import("../../db/schema/index");
      const allVendors = await this.db
        .select()
        .from(vendors)
        .orderBy(vendors.name);

      const result = await Promise.all(
        allVendors.map(async (v: any) => {
          const models = await this.db
            .select()
            .from(vendorModels)
            .where(eq(vendorModels.vendorId, v.id));
          return {
            name: v.name,
            displayName: v.displayName || v.name,
            status: v.status,
            modelCount: models.length,
          };
        })
      );
      return result;
    } catch (err) {
      console.error("[reports] Failed to query vendor status:", err);
      return [];
    }
  }

  private async getActiveFrameworks() {
    try {
      const {
        frameworks,
        frameworkActivations,
        frameworkPolicies,
      } = await import("../../db/schema/index");
      const { and } = await import("drizzle-orm");

      const allFrameworks = await this.db.select().from(frameworks);
      const activeActivations = await this.db
        .select()
        .from(frameworkActivations)
        .where(eq(frameworkActivations.isActive, true));

      const activeFrameworkIds = new Set(
        activeActivations.map((a: any) => a.frameworkId)
      );

      const result = [];
      for (const fw of allFrameworks) {
        if (!activeFrameworkIds.has(fw.id)) continue;

        const fpRows = await this.db
          .select()
          .from(frameworkPolicies)
          .where(
            and(
              eq(frameworkPolicies.frameworkId, fw.id),
              eq(frameworkPolicies.isRequired, true)
            )
          );

        result.push({
          name: fw.name,
          jurisdiction: fw.jurisdiction,
          activePolicyCount: fpRows.length,
        });
      }
      return result;
    } catch (err) {
      console.error("[reports] Failed to query active frameworks:", err);
      return [];
    }
  }
}
