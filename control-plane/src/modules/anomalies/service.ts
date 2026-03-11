/**
 * Anomaly Detection Service
 *
 * Runs all four anomaly detection queries against ClickHouse and transforms
 * raw rows into severity-coded AnomalyAlert objects with human-readable
 * summaries and actionable quick-links.
 *
 * Severity thresholds:
 * - Info:     ratio >= 1.2x and < 2x
 * - Warning:  ratio >= 2x and < 5x
 * - Critical: ratio >= 5x OR multi-factor anomaly
 */

import type { ClickHouseClient } from "@clickhouse/client";
import type { AnomalyAlert, AnomalySummary } from "./model";
import {
  queryOffHoursUsage,
  queryTopicDrift,
  queryVendorSwitching,
  queryVolumeAnomalies,
} from "./queries";

// ---------------------------------------------------------------------------
// Severity computation
// ---------------------------------------------------------------------------

function computeSeverity(ratio: number): AnomalyAlert["severity"] {
  if (ratio >= 5) return "critical";
  if (ratio >= 2) return "warning";
  return "info";
}

function computeOffHoursSeverity(
  currentPct: number,
  historicalPct: number,
): AnomalyAlert["severity"] {
  const diff = currentPct - historicalPct;
  if (diff >= 50 || currentPct >= 80) return "critical";
  if (diff >= 20 || currentPct >= 50) return "warning";
  return "info";
}

const SEVERITY_ORDER: Record<AnomalyAlert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface AnomalyDetectionResult {
  alerts: AnomalyAlert[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// AnomalyService
// ---------------------------------------------------------------------------

export class AnomalyService {
  private clickhouse: ClickHouseClient;

  constructor(clickhouse: ClickHouseClient) {
    this.clickhouse = clickhouse;
  }

  /**
   * Run all four anomaly detection queries and return a sorted list of alerts.
   * Sorted by severity (critical first) then by ratio descending.
   */
  async detectAnomalies(): Promise<AnomalyDetectionResult> {
    const now = new Date().toISOString();
    const alerts: AnomalyAlert[] = [];
    const warnings: string[] = [];

    const handleQueryFailure = (label: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[anomalies] ${label} query failed: ${message}`);
      warnings.push(`${label} query failed: ${message}`);
      return [];
    };

    // Run all four queries in parallel
    const [volumeRows, offHoursRows, vendorRows, topicRows] = await Promise.all([
      queryVolumeAnomalies(this.clickhouse).catch((error: unknown) =>
        handleQueryFailure("volume", error),
      ),
      queryOffHoursUsage(this.clickhouse).catch((error: unknown) =>
        handleQueryFailure("off-hours", error),
      ),
      queryVendorSwitching(this.clickhouse).catch((error: unknown) =>
        handleQueryFailure("vendor-switch", error),
      ),
      queryTopicDrift(this.clickhouse).catch((error: unknown) =>
        handleQueryFailure("topic-drift", error),
      ),
    ]);

    // --- Volume Spikes ---
    for (const row of volumeRows) {
      const severity = computeSeverity(row.ratio);
      alerts.push({
        type: "volume_spike",
        severity,
        actorIdentity: row.actor_identity,
        summary: `Normal: ${Math.round(row.baseline_avg)} requests/hour, Observed: ${row.current_count} requests/hour (${row.ratio.toFixed(1)}x baseline)`,
        baseline: {
          avg_count: Math.round(row.baseline_avg),
          std_dev: Math.round(row.baseline_std),
        },
        current: {
          current_count: row.current_count,
          ratio: Math.round(row.ratio * 100) / 100,
        },
        detectedAt: now,
        actions: [
          {
            label: "View audit trail",
            href: `/audit?actor=${encodeURIComponent(row.actor_identity)}`,
          },
        ],
      });
    }

    // --- Off-Hours Usage ---
    for (const row of offHoursRows) {
      const severity = computeOffHoursSeverity(
        row.current_off_hours_pct,
        row.historical_off_hours_pct,
      );
      alerts.push({
        type: "off_hours",
        severity,
        actorIdentity: row.actor_identity,
        summary: `Historical off-hours: ${row.historical_off_hours_pct.toFixed(1)}%, Current: ${row.current_off_hours_pct.toFixed(1)}% (${row.off_hours_count} of ${row.total_count} requests)`,
        baseline: {
          historical_off_hours_pct: Math.round(row.historical_off_hours_pct * 10) / 10,
        },
        current: {
          off_hours_count: row.off_hours_count,
          total_count: row.total_count,
          current_off_hours_pct: Math.round(row.current_off_hours_pct * 10) / 10,
        },
        detectedAt: now,
        actions: [
          {
            label: "View audit trail",
            href: `/audit?actor=${encodeURIComponent(row.actor_identity)}&from_date=${new Date(Date.now() - 86400000).toISOString()}`,
          },
        ],
      });
    }

    // --- Vendor Switching ---
    for (const row of vendorRows) {
      alerts.push({
        type: "vendor_switch",
        severity: row.switch_count >= 10 ? "warning" : "info",
        actorIdentity: row.actor_identity,
        summary: `Dominant vendor: ${row.dominant_vendor} (${row.dominant_pct.toFixed(0)}%), Switched to: ${row.current_vendor} (${row.switch_count} requests)`,
        baseline: {
          dominant_vendor: row.dominant_vendor,
          dominant_pct: Math.round(row.dominant_pct),
        },
        current: {
          current_vendor: row.current_vendor,
          switch_count: row.switch_count,
        },
        detectedAt: now,
        actions: [
          {
            label: "Investigate vendor usage",
            href: "/vendors",
          },
        ],
      });
    }

    // --- Topic Drift ---
    for (const row of topicRows) {
      const severity = computeSeverity(row.ratio);
      alerts.push({
        type: "topic_drift",
        severity,
        actorIdentity: row.actor_identity,
        summary: `Normal: ${Math.round(row.baseline_avg_unique)} unique topics/hour, Observed: ${row.current_unique_hashes} unique topics/hour (${row.ratio.toFixed(1)}x baseline)`,
        baseline: {
          avg_unique_topics: Math.round(row.baseline_avg_unique),
        },
        current: {
          current_unique_topics: row.current_unique_hashes,
          ratio: Math.round(row.ratio * 100) / 100,
        },
        detectedAt: now,
        actions: [
          {
            label: "Review department policies",
            href: "/department-policies",
          },
        ],
      });
    }

    // Sort: critical first, then warning, then info; within same severity, by most recent
    alerts.sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      // Within same severity, volume/topic anomalies sorted by ratio
      const aRatio = typeof a.current.ratio === "number" ? a.current.ratio : 0;
      const bRatio = typeof b.current.ratio === "number" ? b.current.ratio : 0;
      return bRatio - aRatio;
    });

    return { alerts, warnings };
  }

  /**
   * Generate summary counts from the full alert list.
   */
  async getSummary(): Promise<AnomalySummary> {
    const { alerts } = await this.detectAnomalies();

    const summary: AnomalySummary = {
      total: alerts.length,
      critical: 0,
      warning: 0,
      info: 0,
      byType: {
        volume_spike: 0,
        off_hours: 0,
        vendor_switch: 0,
        topic_drift: 0,
      },
    };

    for (const alert of alerts) {
      summary[alert.severity]++;
      summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
    }

    return summary;
  }
}
