/**
 * Anomaly Detection Module - TypeBox Schemas
 *
 * Type definitions for anomaly alert responses and query parameters.
 * Matches the AnomalyAlert and AnomalySummary interfaces defined
 * in dashboard/src/types/api.ts.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Response Schemas
// ---------------------------------------------------------------------------

/** Action link within an anomaly alert */
export const AnomalyAction = t.Object({
  label: t.String({ maxLength: 500 }),
  href: t.String({ maxLength: 2_000 }),
});

/** A single anomaly alert */
export const AnomalyAlertSchema = t.Object({
  type: t.Union([
    t.Literal("volume_spike"),
    t.Literal("off_hours"),
    t.Literal("vendor_switch"),
    t.Literal("topic_drift"),
  ]),
  severity: t.Union([t.Literal("info"), t.Literal("warning"), t.Literal("critical")]),
  actorIdentity: t.String({ maxLength: 500 }),
  summary: t.String({ maxLength: 5_000 }),
  baseline: t.Record(
    t.String({ maxLength: 255 }),
    t.Union([t.Number(), t.String({ maxLength: 1_000 })]),
  ),
  current: t.Record(
    t.String({ maxLength: 255 }),
    t.Union([t.Number(), t.String({ maxLength: 1_000 })]),
  ),
  detectedAt: t.String({ maxLength: 255 }),
  actions: t.Array(AnomalyAction),
});

/** Summary counts by severity and type */
export const AnomalySummarySchema = t.Object({
  total: t.Number(),
  critical: t.Number(),
  warning: t.Number(),
  info: t.Number(),
  byType: t.Record(t.String(), t.Number()),
});

// ---------------------------------------------------------------------------
// Query Parameter Schemas
// ---------------------------------------------------------------------------

/** Query parameters for GET /anomalies */
export const AnomalyQueryParams = t.Object({
  severity: t.Optional(t.Union([t.Literal("info"), t.Literal("warning"), t.Literal("critical")])),
});

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface AnomalyAlert {
  type: "volume_spike" | "off_hours" | "vendor_switch" | "topic_drift";
  severity: "info" | "warning" | "critical";
  actorIdentity: string;
  summary: string;
  baseline: Record<string, number | string>;
  current: Record<string, number | string>;
  detectedAt: string;
  actions: Array<{ label: string; href: string }>;
}

export interface AnomalySummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  byType: Record<string, number>;
}
