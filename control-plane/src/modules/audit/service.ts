/**
 * Audit Service
 *
 * Business logic layer combining ClickHouse queries with PostgreSQL enrichment.
 * Provides search, aggregate stats, and SSE event streaming.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import {
  queryAuditTrail,
  queryHourlyViolations,
  queryVendorUsage,
  queryDepartmentSummary,
  type AuditTrailFilters,
} from "./queries";
import { enrichAuditRecords } from "./enrichment";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../shared/utilities";
import type { AuditRecord } from "./model";
import type { AppDb } from "../../shared/types";

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

export class AuditService {
  private clickhouse: ClickHouseClient;
  private db: AppDb;

  constructor(clickhouse: ClickHouseClient, db: AppDb) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  /**
   * Apply department scope to audit filters based on the authenticated user's
   * department assignments.
   *
   * - Empty departmentIds = full visibility (Super Admin, unscoped higher roles)
   * - Single department = use existing department filter field
   * - Multiple departments = use IN clause via department_ids filter
   * - If user specifies a department filter that's outside their scope, returns
   *   an impossible filter to yield zero results
   */
  private applyDepartmentScope(
    filters: AuditTrailFilters,
    departmentIds?: string[]
  ): AuditTrailFilters {
    // Empty array = full visibility (Super Admin, unscoped Compliance Officer, etc.)
    if (!departmentIds || departmentIds.length === 0) {
      return filters;
    }

    // Single department: use existing department filter field
    if (departmentIds.length === 1) {
      // If user also specified a department filter in query, validate it's within scope
      if (filters.department && filters.department !== departmentIds[0]) {
        // User requested a department they don't have access to -- return empty
        return { ...filters, department: "__no_access__" };
      }
      return { ...filters, department: departmentIds[0] };
    }

    // Multiple departments: use IN clause
    if (filters.department) {
      // Validate the requested department is in scope
      if (!departmentIds.includes(filters.department)) {
        return { ...filters, department: "__no_access__" };
      }
      // User's explicit filter is within scope -- keep it (more specific than IN)
      return filters;
    }

    return { ...filters, department_ids: departmentIds };
  }

  /**
   * Search audit trail with filters, pagination, enrichment, and department scoping.
   */
  async search(
    filters: AuditTrailFilters,
    cursor?: string,
    pageSize?: number,
    departmentIds?: string[]
  ): Promise<{
    items: AuditRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const scopedFilters = this.applyDepartmentScope(filters, departmentIds);

    const result = await queryAuditTrail(
      this.clickhouse,
      scopedFilters,
      cursor,
      limit
    );

    const enriched = await enrichAuditRecords(this.db, result.items);

    return {
      items: enriched,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get hourly violation time series from materialized view.
   */
  async getHourlyViolations(from: string, to: string, departmentIds?: string[]) {
    return queryHourlyViolations(this.clickhouse, from, to, departmentIds);
  }

  /**
   * Get vendor usage stats from materialized view.
   */
  async getVendorUsage(from: string, to: string, vendor?: string, departmentIds?: string[]) {
    return queryVendorUsage(this.clickhouse, from, to, vendor, departmentIds);
  }

  /**
   * Get department summary from materialized view with department scoping.
   */
  async getDepartmentSummary(
    from: string,
    to: string,
    department?: string,
    departmentIds?: string[]
  ) {
    // For department summary, apply scope directly to queryDepartmentSummary
    // which accepts both single department and departmentIds array
    if (departmentIds && departmentIds.length > 0) {
      if (department) {
        // Validate user's explicit filter is within scope
        if (!departmentIds.includes(department)) {
          // Return empty -- query with impossible filter
          return queryDepartmentSummary(
            this.clickhouse,
            from,
            to,
            "__no_access__"
          );
        }
        // User's explicit filter is within scope -- keep it
        return queryDepartmentSummary(
          this.clickhouse,
          from,
          to,
          department
        );
      }
      // No explicit department filter -- scope to user's departments
      return queryDepartmentSummary(
        this.clickhouse,
        from,
        to,
        undefined,
        departmentIds
      );
    }
    return queryDepartmentSummary(this.clickhouse, from, to, department);
  }

  /**
   * Poll ClickHouse for events newer than lastTimestamp with department scoping.
   * Used by the SSE streaming endpoint.
   */
  async streamEvents(
    lastTimestamp: string,
    filters: AuditTrailFilters,
    departmentIds?: string[]
  ): Promise<AuditRecord[]> {
    const scopedFilters = this.applyDepartmentScope(filters, departmentIds);

    const result = await queryAuditTrail(
      this.clickhouse,
      {
        ...scopedFilters,
        from_date: lastTimestamp,
      },
      undefined,
      50 // Limit per poll
    );

    if (result.items.length === 0) {
      return [];
    }

    return enrichAuditRecords(this.db, result.items);
  }
}
