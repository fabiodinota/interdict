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

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

export class AuditService {
  private clickhouse: ClickHouseClient;
  private db: any;

  constructor(clickhouse: ClickHouseClient, db: any) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  /**
   * Search audit trail with filters, pagination, and enrichment.
   */
  async search(
    filters: AuditTrailFilters,
    cursor?: string,
    pageSize?: number
  ): Promise<{
    items: AuditRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const result = await queryAuditTrail(
      this.clickhouse,
      filters,
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
  async getHourlyViolations(from: string, to: string) {
    return queryHourlyViolations(this.clickhouse, from, to);
  }

  /**
   * Get vendor usage stats from materialized view.
   */
  async getVendorUsage(from: string, to: string, vendor?: string) {
    return queryVendorUsage(this.clickhouse, from, to, vendor);
  }

  /**
   * Get department summary from materialized view.
   */
  async getDepartmentSummary(
    from: string,
    to: string,
    department?: string
  ) {
    return queryDepartmentSummary(this.clickhouse, from, to, department);
  }

  /**
   * Poll ClickHouse for events newer than lastTimestamp.
   * Used by the SSE streaming endpoint.
   */
  async streamEvents(
    lastTimestamp: string,
    filters: AuditTrailFilters
  ): Promise<AuditRecord[]> {
    const result = await queryAuditTrail(
      this.clickhouse,
      {
        ...filters,
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
