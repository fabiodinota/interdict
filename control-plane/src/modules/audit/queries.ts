/**
 * Audit Query Builders
 *
 * ClickHouse parameterized query builders for the audit trail API.
 * All queries use explicit column lists (excluding prompt_text and response_text
 * per CLAUDE.md Invariant 6) and always include date range filters for
 * partition pruning.
 *
 * Cursor-based pagination uses timestamp + bundle_id for stable DESC ordering.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { DEFAULT_PAGE_SIZE, decodeCursor, encodeCursor } from "../../shared/utilities";
import type { ClickHouseAuditRow } from "./model";

/**
 * Convert an ISO 8601 string (e.g. "2026-03-05T19:29:46.204Z") to the
 * ClickHouse DateTime64(3) string format ("2026-03-05 19:29:46.204").
 * ClickHouse does not accept the T separator or Z suffix.
 */
function toChDateTime(iso: string): string {
  return iso.replace("T", " ").replace("Z", "");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditTrailFilters {
  vendor?: string;
  department?: string;
  department_ids?: string[]; // Multi-department IN clause (from user's department assignments)
  actor_identity?: string;
  policy_action?: string;
  from_date?: string;
  to_date?: string;
  kernel_id?: string;
}

export interface AuditTrailResult {
  items: ClickHouseAuditRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Column list (Invariant 6: EXCLUDE prompt_text and response_text)
// ---------------------------------------------------------------------------

const AUDIT_COLUMNS = [
  "timestamp",
  "bundle_id",
  "kernel_id",
  "actor_identity",
  "department",
  "vendor",
  "model",
  "prompt_hash",
  "response_hash",
  "policy_action",
  "policy_rules_json",
  "token_count",
  "enforcement_latency_us",
  "chain_hash",
  "previous_hash",
  "sequence_number",
  "signature",
  "signing_key_id",
  "dev_signed",
  "schema_version",
  "event_date",
].join(", ");

// ---------------------------------------------------------------------------
// queryAuditTrail
// ---------------------------------------------------------------------------

/**
 * Query the evidence_bundles table with parameterized filters and cursor pagination.
 *
 * CRITICAL constraints:
 * - Explicit column list (no SELECT *, no prompt_text/response_text)
 * - Always includes date range filter for partition pruning
 * - Cursor-based pagination for stable DESC ordering
 * - Parameterized query syntax ({param:Type}) to prevent injection
 * - Fetches limit + 1 to determine hasMore
 */
export async function queryAuditTrail(
  client: ClickHouseClient,
  filters: AuditTrailFilters,
  cursor?: string,
  limit: number = DEFAULT_PAGE_SIZE,
): Promise<AuditTrailResult> {
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit: limit + 1 };

  // --- Always include date range filter for partition pruning (Pitfall 3) ---
  if (filters.from_date) {
    conditions.push("event_date >= {from_date:String}");
    params.from_date = filters.from_date.substring(0, 10); // extract YYYY-MM-DD
  } else {
    // Default to last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    conditions.push("event_date >= {from_date:String}");
    params.from_date = sevenDaysAgo.toISOString().substring(0, 10);
  }

  if (filters.to_date) {
    conditions.push("event_date <= {to_date:String}");
    params.to_date = filters.to_date.substring(0, 10);
  }

  // --- Cursor pagination ---
  if (cursor) {
    const c = decodeCursor(cursor);
    conditions.push(
      "(timestamp < {cursor_ts:DateTime64(3)} OR (timestamp = {cursor_ts:DateTime64(3)} AND bundle_id < {cursor_id:String}))",
    );
    params.cursor_ts = toChDateTime(new Date(c.timestamp).toISOString());
    params.cursor_id = c.id;
  }

  // --- LowCardinality column filters (efficient) ---
  if (filters.vendor) {
    conditions.push("vendor = {vendor:String}");
    params.vendor = filters.vendor;
  }

  if (filters.department) {
    conditions.push("department = {department:String}");
    params.department = filters.department;
  }

  if (filters.policy_action) {
    conditions.push("policy_action = {policy_action:String}");
    params.policy_action = filters.policy_action;
  }

  // --- Non-LC column filters (include date range to limit scan) ---
  if (filters.actor_identity) {
    conditions.push("actor_identity = {actor_identity:String}");
    params.actor_identity = filters.actor_identity;
  }

  if (filters.kernel_id) {
    conditions.push("kernel_id = {kernel_id:String}");
    params.kernel_id = filters.kernel_id;
  }

  // Multi-department scoping (from user's department assignments)
  if (filters.department_ids && filters.department_ids.length > 0) {
    conditions.push("department IN {dept_ids:Array(String)}");
    params.dept_ids = filters.department_ids;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `SELECT ${AUDIT_COLUMNS} FROM evidence_bundles ${where} ORDER BY timestamp DESC, bundle_id DESC LIMIT {limit:UInt32}`;

  const resultSet = await client.query({
    query,
    format: "JSONEachRow",
    query_params: params,
  });

  const rows: ClickHouseAuditRow[] = await resultSet.json();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && items.length > 0
      ? encodeCursor(
          new Date(items[items.length - 1].timestamp).getTime(),
          items[items.length - 1].bundle_id,
        )
      : null;

  return { items, nextCursor, hasMore };
}

// ---------------------------------------------------------------------------
// Materialized view queries
// ---------------------------------------------------------------------------

/**
 * Query mv_hourly_violations for violation time series.
 */
export async function queryHourlyViolations(
  client: ClickHouseClient,
  from: string,
  to: string,
  departmentIds?: string[], // HIGH-011: scope to user's visible departments
): Promise<unknown[]> {
  const conditions = ["hour >= {from:DateTime64(3)}", "hour <= {to:DateTime64(3)}"];
  const params: Record<string, unknown> = { from: toChDateTime(from), to: toChDateTime(to) };

  if (departmentIds && departmentIds.length > 0) {
    conditions.push("department IN {dept_ids:Array(String)}");
    params.dept_ids = departmentIds;
  }

  const resultSet = await client.query({
    query: `
      SELECT hour, policy_action, violation_count, unique_actors, unique_vendors
      FROM mv_hourly_violations
      WHERE ${conditions.join(" AND ")}
      ORDER BY hour ASC
    `,
    format: "JSONEachRow",
    query_params: params,
  });

  return resultSet.json();
}

/**
 * Query mv_vendor_usage for per-vendor per-model usage stats.
 */
export async function queryVendorUsage(
  client: ClickHouseClient,
  from: string,
  to: string,
  vendor?: string,
  departmentIds?: string[], // HIGH-011: scope to user's visible departments
): Promise<unknown[]> {
  const conditions = ["hour >= {from:DateTime64(3)}", "hour <= {to:DateTime64(3)}"];
  const params: Record<string, unknown> = { from: toChDateTime(from), to: toChDateTime(to) };

  if (vendor) {
    conditions.push("vendor = {vendor:String}");
    params.vendor = vendor;
  }

  if (departmentIds && departmentIds.length > 0) {
    conditions.push("department IN {dept_ids:Array(String)}");
    params.dept_ids = departmentIds;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const resultSet = await client.query({
    query: `
      SELECT hour, vendor, model, request_count, total_tokens, avg_latency_us
      FROM mv_vendor_usage
      ${where}
      ORDER BY hour ASC
    `,
    format: "JSONEachRow",
    query_params: params,
  });

  return resultSet.json();
}

/**
 * Query mv_department_summary for per-department per-action counts.
 * Supports optional department_ids for multi-department IN clause filtering.
 */
export async function queryDepartmentSummary(
  client: ClickHouseClient,
  from: string,
  to: string,
  department?: string,
  departmentIds?: string[],
): Promise<unknown[]> {
  const conditions = ["hour >= {from:DateTime64(3)}", "hour <= {to:DateTime64(3)}"];
  const params: Record<string, unknown> = { from: toChDateTime(from), to: toChDateTime(to) };

  if (department) {
    conditions.push("department = {department:String}");
    params.department = department;
  }

  // Multi-department scoping (from user's department assignments)
  if (departmentIds && departmentIds.length > 0) {
    conditions.push("department IN {dept_ids:Array(String)}");
    params.dept_ids = departmentIds;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const resultSet = await client.query({
    query: `
      SELECT hour, department, policy_action, action_count, unique_actors
      FROM mv_department_summary
      ${where}
      ORDER BY hour ASC
    `,
    format: "JSONEachRow",
    query_params: params,
  });

  return resultSet.json();
}
