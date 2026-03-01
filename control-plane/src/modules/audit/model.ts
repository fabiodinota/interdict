/**
 * Audit Module - TypeBox Schemas
 *
 * Type definitions for audit trail queries, filters, pagination,
 * materialized view queries, and enriched response records.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Audit Trail Search
// ---------------------------------------------------------------------------

/** Filter parameters for audit trail queries */
export const AuditFilters = t.Object({
  vendor: t.Optional(t.String()),
  department: t.Optional(t.String()),
  actor_identity: t.Optional(t.String()),
  policy_action: t.Optional(
    t.Union([
      t.Literal("allow"),
      t.Literal("block"),
      t.Literal("redact"),
    ])
  ),
  from_date: t.Optional(t.String({ format: "date-time" })),
  to_date: t.Optional(t.String({ format: "date-time" })),
  kernel_id: t.Optional(t.String()),
});

/** Query parameters combining filters with pagination */
export const AuditQueryParams = t.Object({
  vendor: t.Optional(t.String()),
  department: t.Optional(t.String()),
  actor: t.Optional(t.String()),
  policy_action: t.Optional(
    t.Union([
      t.Literal("allow"),
      t.Literal("block"),
      t.Literal("redact"),
    ])
  ),
  from_date: t.Optional(t.String()),
  to_date: t.Optional(t.String()),
  kernel_id: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  page_size: t.Optional(
    t.Number({ minimum: 1, maximum: 200, default: 50 })
  ),
});

/** A single enriched audit record returned by the search API */
export interface AuditRecord {
  timestamp: string;
  bundle_id: string;
  kernel_id: string;
  actor_identity: string;
  actor_display_name: string | null;
  department: string;
  department_display_name: string | null;
  vendor: string;
  vendor_display_name: string | null;
  model: string;
  policy_action: string;
  policy_rules: unknown[];
  token_count: number;
  enforcement_latency_us: number;
  chain_hash: string;
  prompt_hash: string;
  response_hash: string;
}

/** Raw ClickHouse row before enrichment */
export interface ClickHouseAuditRow {
  timestamp: string;
  bundle_id: string;
  kernel_id: string;
  actor_identity: string;
  department: string;
  vendor: string;
  model: string;
  prompt_hash: string;
  response_hash: string;
  policy_action: string;
  policy_rules_json: string;
  token_count: number;
  enforcement_latency_us: number;
  chain_hash: string;
  previous_hash: string;
  sequence_number: number;
  signature: string;
  signing_key_id: string;
  dev_signed: number;
  schema_version: number;
  event_date: string;
}

// ---------------------------------------------------------------------------
// Materialized View Queries
// ---------------------------------------------------------------------------

/** Query parameters for hourly violations time series */
export const HourlyViolationsQuery = t.Object({
  from: t.String(),
  to: t.String(),
});

/** A single hourly violation record from mv_hourly_violations */
export interface HourlyViolationRecord {
  hour: string;
  policy_action: string;
  violation_count: number;
  unique_actors: number;
  unique_vendors: number;
}

/** Query parameters for vendor usage time series */
export const VendorUsageQuery = t.Object({
  from: t.String(),
  to: t.String(),
  vendor: t.Optional(t.String()),
});

/** A single vendor usage record from mv_vendor_usage */
export interface VendorUsageRecord {
  hour: string;
  vendor: string;
  model: string;
  request_count: number;
  total_tokens: number;
  avg_latency_us: number;
}

/** Query parameters for department summary time series */
export const DepartmentSummaryQuery = t.Object({
  from: t.String(),
  to: t.String(),
  department: t.Optional(t.String()),
});

/** A single department summary record from mv_department_summary */
export interface DepartmentSummaryRecord {
  hour: string;
  department: string;
  policy_action: string;
  action_count: number;
  unique_actors: number;
}
