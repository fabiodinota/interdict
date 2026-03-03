/**
 * Anomaly Detection Query Builders
 *
 * ClickHouse parameterized queries for detecting statistical anomalies
 * in user behavior: volume spikes, off-hours usage, vendor switching,
 * and topic drift (prompt hash entropy).
 *
 * CRITICAL: All queries include event_date partition filter to prevent full table scans.
 * CRITICAL: No raw prompt_hash values returned (Invariant #6). Only counts.
 */

import type { ClickHouseClient } from "@clickhouse/client";

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface VolumeAnomalyRow {
  actor_identity: string;
  current_count: number;
  baseline_avg: number;
  baseline_std: number;
  ratio: number;
}

export interface OffHoursRow {
  actor_identity: string;
  off_hours_count: number;
  total_count: number;
  historical_off_hours_pct: number;
  current_off_hours_pct: number;
}

export interface VendorSwitchRow {
  actor_identity: string;
  dominant_vendor: string;
  current_vendor: string;
  dominant_pct: number;
  switch_count: number;
}

export interface TopicDriftRow {
  actor_identity: string;
  current_unique_hashes: number;
  baseline_avg_unique: number;
  ratio: number;
}

// ---------------------------------------------------------------------------
// 1. Volume Anomalies
// ---------------------------------------------------------------------------

/**
 * Compare current hour request count per actor against 7-day same-hour average.
 * Returns actors whose current count exceeds baseline_avg * thresholdRatio.
 */
export async function queryVolumeAnomalies(
  client: ClickHouseClient,
  thresholdRatio: number = 1.2
): Promise<VolumeAnomalyRow[]> {
  const query = `
    WITH baseline AS (
      SELECT
        actor_identity,
        avg(hourly_count) AS avg_count,
        stddevPop(hourly_count) AS std_count
      FROM (
        SELECT
          actor_identity,
          toDate(timestamp) AS day,
          count() AS hourly_count
        FROM evidence_bundles
        WHERE event_date >= today() - 7
          AND event_date < today()
          AND toHour(timestamp) = toHour(now())
        GROUP BY actor_identity, day
      )
      GROUP BY actor_identity
    ),
    current_hour AS (
      SELECT
        actor_identity,
        count() AS current_count
      FROM evidence_bundles
      WHERE event_date = today()
        AND timestamp >= toStartOfHour(now())
      GROUP BY actor_identity
    )
    SELECT
      c.actor_identity AS actor_identity,
      c.current_count AS current_count,
      b.avg_count AS baseline_avg,
      b.std_count AS baseline_std,
      c.current_count / greatest(b.avg_count, 1) AS ratio
    FROM current_hour c
    INNER JOIN baseline b ON c.actor_identity = b.actor_identity
    WHERE c.current_count > b.avg_count * {threshold:Float64}
    ORDER BY ratio DESC
  `;

  const resultSet = await client.query({
    query,
    format: "JSONEachRow",
    query_params: { threshold: thresholdRatio },
  });

  return resultSet.json();
}

// ---------------------------------------------------------------------------
// 2. Off-Hours Usage
// ---------------------------------------------------------------------------

/**
 * Find users with requests outside business hours who historically work in-hours.
 * Flags users whose current off-hours ratio significantly exceeds their baseline.
 */
export async function queryOffHoursUsage(
  client: ClickHouseClient,
  businessStart: number = 6,
  businessEnd: number = 22
): Promise<OffHoursRow[]> {
  const query = `
    WITH historical AS (
      SELECT
        actor_identity,
        countIf(toHour(timestamp) < {biz_start:UInt8} OR toHour(timestamp) >= {biz_end:UInt8}) AS hist_off,
        count() AS hist_total
      FROM evidence_bundles
      WHERE event_date >= today() - 30
        AND event_date < today()
      GROUP BY actor_identity
      HAVING hist_total >= 10
    ),
    recent AS (
      SELECT
        actor_identity,
        countIf(toHour(timestamp) < {biz_start:UInt8} OR toHour(timestamp) >= {biz_end:UInt8}) AS off_count,
        count() AS total_count
      FROM evidence_bundles
      WHERE event_date >= today() - 1
        AND event_date <= today()
      GROUP BY actor_identity
      HAVING total_count > 0
    )
    SELECT
      r.actor_identity AS actor_identity,
      r.off_count AS off_hours_count,
      r.total_count AS total_count,
      h.hist_off / greatest(h.hist_total, 1) * 100 AS historical_off_hours_pct,
      r.off_count / greatest(r.total_count, 1) * 100 AS current_off_hours_pct
    FROM recent r
    INNER JOIN historical h ON r.actor_identity = h.actor_identity
    WHERE r.off_count > 0
      AND (r.off_count / greatest(r.total_count, 1)) > (h.hist_off / greatest(h.hist_total, 1)) * 1.5
    ORDER BY current_off_hours_pct DESC
  `;

  const resultSet = await client.query({
    query,
    format: "JSONEachRow",
    query_params: {
      biz_start: businessStart,
      biz_end: businessEnd,
    },
  });

  return resultSet.json();
}

// ---------------------------------------------------------------------------
// 3. Vendor Switching
// ---------------------------------------------------------------------------

/**
 * Find users who switched to a different vendor than their dominant one.
 * Dominant vendor = the one handling >80% of requests over past 30 days.
 */
export async function queryVendorSwitching(
  client: ClickHouseClient
): Promise<VendorSwitchRow[]> {
  const query = `
    WITH vendor_counts AS (
      SELECT
        actor_identity,
        vendor,
        count() AS vendor_count,
        sum(count()) OVER (PARTITION BY actor_identity) AS total_count
      FROM evidence_bundles
      WHERE event_date >= today() - 30
        AND event_date < today()
      GROUP BY actor_identity, vendor
    ),
    dominant AS (
      SELECT
        actor_identity,
        vendor AS dominant_vendor,
        vendor_count / greatest(total_count, 1) AS dominant_pct
      FROM vendor_counts
      WHERE vendor_count / greatest(total_count, 1) > 0.8
    ),
    recent_vendors AS (
      SELECT
        actor_identity,
        vendor AS current_vendor,
        count() AS switch_count
      FROM evidence_bundles
      WHERE event_date >= today() - 1
        AND event_date <= today()
      GROUP BY actor_identity, vendor
    )
    SELECT
      d.actor_identity AS actor_identity,
      d.dominant_vendor AS dominant_vendor,
      r.current_vendor AS current_vendor,
      d.dominant_pct * 100 AS dominant_pct,
      r.switch_count AS switch_count
    FROM recent_vendors r
    INNER JOIN dominant d ON r.actor_identity = d.actor_identity
    WHERE r.current_vendor != d.dominant_vendor
    ORDER BY r.switch_count DESC
  `;

  const resultSet = await client.query({
    query,
    format: "JSONEachRow",
    query_params: {},
  });

  return resultSet.json();
}

// ---------------------------------------------------------------------------
// 4. Topic Drift (Prompt Hash Entropy)
// ---------------------------------------------------------------------------

/**
 * Detect topic drift using prompt hash entropy as a proxy.
 * Compares unique prompt hashes in current hour against 7-day baseline.
 *
 * IMPORTANT: Only returns counts of unique hashes, never the hash values
 * themselves (Invariant #6 compliance).
 */
export async function queryTopicDrift(
  client: ClickHouseClient
): Promise<TopicDriftRow[]> {
  const query = `
    WITH baseline AS (
      SELECT
        actor_identity,
        avg(unique_hashes) AS avg_unique
      FROM (
        SELECT
          actor_identity,
          toDate(timestamp) AS day,
          uniqExact(prompt_hash) AS unique_hashes
        FROM evidence_bundles
        WHERE event_date >= today() - 7
          AND event_date < today()
          AND toHour(timestamp) = toHour(now())
        GROUP BY actor_identity, day
      )
      GROUP BY actor_identity
    ),
    current_hour AS (
      SELECT
        actor_identity,
        uniqExact(prompt_hash) AS current_unique
      FROM evidence_bundles
      WHERE event_date = today()
        AND timestamp >= toStartOfHour(now())
      GROUP BY actor_identity
    )
    SELECT
      c.actor_identity AS actor_identity,
      c.current_unique AS current_unique_hashes,
      b.avg_unique AS baseline_avg_unique,
      c.current_unique / greatest(b.avg_unique, 1) AS ratio
    FROM current_hour c
    INNER JOIN baseline b ON c.actor_identity = b.actor_identity
    WHERE c.current_unique > b.avg_unique * 1.5
    ORDER BY ratio DESC
  `;

  const resultSet = await client.query({
    query,
    format: "JSONEachRow",
    query_params: {},
  });

  return resultSet.json();
}
