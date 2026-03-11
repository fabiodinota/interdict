/**
 * Report Service
 *
 * Gathers report data from ClickHouse (audit metrics) and PostgreSQL
 * (policies, vendors, frameworks) for compliance report generation.
 *
 * Phase 18 hardening:
 * - Storage errors propagate as explicit failures (no silent zeros/empties).
 * - Each section is fetched independently; partial failures produce a
 *   `warnings` array so operators see exactly which data is missing.
 * - N+1 queries replaced with JOINs / bulk queries.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { eq, and, count, sql } from "drizzle-orm";
import {
  policies,
  policyVersions,
} from "../../db/schema/index";
import type { AppDb } from "../../shared/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A section that failed to load — included in the report so operators know. */
export interface ReportWarning {
  section: string;
  message: string;
}

export interface ReportData {
  dateRange: { from: string; to: string };
  generatedAt: string;

  /** Non-empty when one or more report sections failed to load. */
  warnings: ReportWarning[];

  // Summary stats
  summary: {
    totalRequests: number;
    totalViolations: number;
    uniqueActors: number;
    uniqueVendors: number;
  } | null;

  // Violations by type
  violationsByType: Array<{
    action: string;
    count: number;
  }> | null;

  // Violations by department
  violationsByDepartment: Array<{
    department: string;
    count: number;
  }> | null;

  // Violations by vendor
  violationsByVendor: Array<{
    vendor: string;
    count: number;
  }> | null;

  // Top 10 incidents (most severe)
  topIncidents: Array<{
    timestamp: string;
    actor: string;
    vendor: string;
    model: string;
    action: string;
    tokenCount: number;
  }> | null;

  // Active policies
  activePolicies: Array<{
    name: string;
    enabled: boolean;
    compilationStatus: string | null;
  }> | null;

  // Vendor approval status
  vendorStatus: Array<{
    name: string;
    displayName: string;
    status: string;
    modelCount: number;
  }> | null;

  // Active regulatory frameworks
  activeFrameworks: Array<{
    name: string;
    jurisdiction: string | null;
    activePolicyCount: number;
  }> | null;
}

interface SummaryRow {
  total_requests: number | string;
  total_violations: number | string;
  unique_actors: number | string;
  unique_vendors: number | string;
}

interface CountRow {
  count: number | string;
}

interface ViolationsByTypeRow extends CountRow {
  action: string;
}

interface ViolationsByDepartmentRow extends CountRow {
  department: string;
}

interface ViolationsByVendorRow extends CountRow {
  vendor: string;
}

interface TopIncidentRow {
  timestamp: string;
  actor: string;
  vendor: string;
  model: string;
  action: string;
  tokenCount: number | string;
}

async function jsonRows<T>(result: { json: () => Promise<unknown> }): Promise<T[]> {
  return (await result.json()) as T[];
}

function toDatePartition(value: string): string {
  return value.substring(0, 10);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReportService {
  private clickhouse: ClickHouseClient;
  private db: AppDb;

  constructor(clickhouse: ClickHouseClient, db: AppDb) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  /**
   * Gather report data with explicit error surfacing.
   *
   * Each section is fetched independently. If a section fails, its value
   * is `null` and a warning is appended. The caller (PDF/CSV generator)
   * renders the warning to the operator instead of hiding the failure.
   */
  async getReportData(fromDate: string, toDate: string): Promise<ReportData> {
    const warnings: ReportWarning[] = [];

    // Helper: run a section, capture failures
    async function section<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
      try {
        return await fn();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reports] Section "${name}" failed: ${msg}`);
        warnings.push({ section: name, message: msg });
        return null;
      }
    }

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
      section("summary", () => this.getSummaryStats(fromDate, toDate)),
      section("violationsByType", () => this.getViolationsByType(fromDate, toDate)),
      section("violationsByDepartment", () => this.getViolationsByDepartment(fromDate, toDate)),
      section("violationsByVendor", () => this.getViolationsByVendor(fromDate, toDate)),
      section("topIncidents", () => this.getTopIncidents(fromDate, toDate)),
      section("activePolicies", () => this.getActivePolicies()),
      section("vendorStatus", () => this.getVendorStatus()),
      section("activeFrameworks", () => this.getActiveFrameworks()),
    ]);

    return {
      dateRange: { from: fromDate, to: toDate },
      generatedAt: new Date().toISOString(),
      warnings,
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

  // -------------------------------------------------------------------------
  // ClickHouse sections — errors propagate (no silent fallback)
  // -------------------------------------------------------------------------

  private async getSummaryStats(from: string, to: string) {
    const fromDate = toDatePartition(from);
    const toDate = toDatePartition(to);
    const result = await this.clickhouse.query({
      query: `
        SELECT
          count() as total_requests,
          countIf(policy_action IN ('block', 'redact')) as total_violations,
          uniq(actor_identity) as unique_actors,
          uniq(vendor) as unique_vendors
        FROM evidence_bundles
        WHERE event_date >= {from_date:String}
          AND event_date <= {to_date:String}
          AND timestamp >= parseDateTimeBestEffort({from:String})
          AND timestamp <= parseDateTimeBestEffort({to:String})
      `,
      query_params: { from, to, from_date: fromDate, to_date: toDate },
      format: "JSONEachRow",
    });
    const rows = await jsonRows<SummaryRow>(result);
    if (rows.length > 0) {
      return {
        totalRequests: Number(rows[0].total_requests) || 0,
        totalViolations: Number(rows[0].total_violations) || 0,
        uniqueActors: Number(rows[0].unique_actors) || 0,
        uniqueVendors: Number(rows[0].unique_vendors) || 0,
      };
    }
    return { totalRequests: 0, totalViolations: 0, uniqueActors: 0, uniqueVendors: 0 };
  }

  private async getViolationsByType(from: string, to: string) {
    const fromDate = toDatePartition(from);
    const toDate = toDatePartition(to);
    const result = await this.clickhouse.query({
      query: `
        SELECT policy_action as action, count() as count
        FROM evidence_bundles
        WHERE event_date >= {from_date:String}
          AND event_date <= {to_date:String}
          AND timestamp >= parseDateTimeBestEffort({from:String})
          AND timestamp <= parseDateTimeBestEffort({to:String})
        GROUP BY policy_action
        ORDER BY count DESC
      `,
      query_params: { from, to, from_date: fromDate, to_date: toDate },
      format: "JSONEachRow",
    });
    const rows = await jsonRows<ViolationsByTypeRow>(result);
    return rows.map((r) => ({ action: r.action, count: Number(r.count) }));
  }

  private async getViolationsByDepartment(from: string, to: string) {
    const fromDate = toDatePartition(from);
    const toDate = toDatePartition(to);
    const result = await this.clickhouse.query({
      query: `
        SELECT department, count() as count
        FROM evidence_bundles
        WHERE event_date >= {from_date:String}
          AND event_date <= {to_date:String}
          AND timestamp >= parseDateTimeBestEffort({from:String})
          AND timestamp <= parseDateTimeBestEffort({to:String})
          AND policy_action IN ('block', 'redact')
        GROUP BY department
        ORDER BY count DESC
        LIMIT 20
      `,
      query_params: { from, to, from_date: fromDate, to_date: toDate },
      format: "JSONEachRow",
    });
    const rows = await jsonRows<ViolationsByDepartmentRow>(result);
    return rows.map((r) => ({ department: r.department, count: Number(r.count) }));
  }

  private async getViolationsByVendor(from: string, to: string) {
    const fromDate = toDatePartition(from);
    const toDate = toDatePartition(to);
    const result = await this.clickhouse.query({
      query: `
        SELECT vendor, count() as count
        FROM evidence_bundles
        WHERE event_date >= {from_date:String}
          AND event_date <= {to_date:String}
          AND timestamp >= parseDateTimeBestEffort({from:String})
          AND timestamp <= parseDateTimeBestEffort({to:String})
          AND policy_action IN ('block', 'redact')
        GROUP BY vendor
        ORDER BY count DESC
        LIMIT 20
      `,
      query_params: { from, to, from_date: fromDate, to_date: toDate },
      format: "JSONEachRow",
    });
    const rows = await jsonRows<ViolationsByVendorRow>(result);
    return rows.map((r) => ({ vendor: r.vendor, count: Number(r.count) }));
  }

  private async getTopIncidents(from: string, to: string) {
    const fromDate = toDatePartition(from);
    const toDate = toDatePartition(to);
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
        WHERE event_date >= {from_date:String}
          AND event_date <= {to_date:String}
          AND timestamp >= parseDateTimeBestEffort({from:String})
          AND timestamp <= parseDateTimeBestEffort({to:String})
          AND policy_action IN ('block', 'redact')
        ORDER BY timestamp DESC
        LIMIT 10
      `,
      query_params: { from, to, from_date: fromDate, to_date: toDate },
      format: "JSONEachRow",
    });
    const rows = await jsonRows<TopIncidentRow>(result);
    return rows.map((r) => ({
      timestamp: r.timestamp,
      actor: r.actor,
      vendor: r.vendor,
      model: r.model,
      action: r.action,
      tokenCount: Number(r.tokenCount) || 0,
    }));
  }

  // -------------------------------------------------------------------------
  // PostgreSQL sections — errors propagate, N+1 fixed with JOINs
  // -------------------------------------------------------------------------

  /**
   * Get active policies with compilation status.
   * Phase 18: single JOIN query replaces N+1 per-policy version lookup.
   */
  private async getActivePolicies() {
    const rows = await this.db
      .select({
        name: policies.name,
        isActive: policies.isActive,
        compilationStatus: policyVersions.compilationStatus,
      })
      .from(policies)
      .leftJoin(
        policyVersions,
        eq(policyVersions.id, policies.currentVersionId)
      )
      .orderBy(policies.name);

    return rows.map((policy) => ({
      name: policy.name,
      enabled: policy.isActive,
      compilationStatus: policy.compilationStatus ?? null,
    }));
  }

  /**
   * Get vendor status with model counts.
   * Phase 18: single GROUP BY query replaces N+1 per-vendor model lookup.
   */
  private async getVendorStatus() {
    const { vendors, vendorModels } = await import("../../db/schema/index");

    const rows = await this.db
      .select({
        name: vendors.name,
        displayName: vendors.displayName,
        status: vendors.status,
        modelCount: count(vendorModels.id),
      })
      .from(vendors)
      .leftJoin(vendorModels, eq(vendorModels.vendorId, vendors.id))
      .groupBy(vendors.id, vendors.name, vendors.displayName, vendors.status)
      .orderBy(vendors.name);

    return rows.map((vendor) => ({
      name: vendor.name,
      displayName: vendor.displayName || vendor.name,
      status: vendor.status,
      modelCount: Number(vendor.modelCount),
    }));
  }

  /**
   * Get active regulatory frameworks with policy counts.
   * Phase 18: bulk queries (3 round-trips) replace N+1 per-framework lookup.
   */
  private async getActiveFrameworks() {
    const {
      frameworks,
      frameworkActivations,
      frameworkPolicies,
    } = await import("../../db/schema/index");

    // 3 bulk queries — no N+1
    const [allFrameworks, activeActivations, policyCounts] = await Promise.all([
      this.db.select().from(frameworks),
      this.db
        .select({ frameworkId: frameworkActivations.frameworkId })
        .from(frameworkActivations)
        .where(eq(frameworkActivations.isActive, true)),
      this.db
        .select({
          frameworkId: frameworkPolicies.frameworkId,
          activePolicyCount: count(),
        })
        .from(frameworkPolicies)
        .where(eq(frameworkPolicies.isRequired, true))
        .groupBy(frameworkPolicies.frameworkId),
    ]);

    const activeFrameworkIds = new Set(activeActivations.map((activation) => activation.frameworkId));
    const countMap = new Map<string, number>(
      policyCounts.map((row) => [row.frameworkId, Number(row.activePolicyCount)])
    );

    return allFrameworks
      .filter((framework) => activeFrameworkIds.has(framework.id))
      .map((framework) => ({
        name: framework.name,
        jurisdiction: framework.jurisdiction,
        activePolicyCount: countMap.get(framework.id) ?? 0,
      }));
  }
}
