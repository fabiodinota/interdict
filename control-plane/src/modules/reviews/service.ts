/**
 * Review Service
 *
 * Business logic for the human review queue. Manages review items
 * with optimistic locking on claims, mandatory resolution validation,
 * and background sync of ClickHouse escalations to Postgres.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { eq, and, sql, lt, inArray } from "drizzle-orm";
import { reviewItems } from "../../db/schema/reviews";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ConflictError,
  ValidationError,
} from "../../shared/utilities";
import {
  ALLOWED_RESOLUTIONS,
  type ReviewItemResponse,
  type EscalatedBundleRow,
} from "./model";

// SLA duration: 4 hours in milliseconds
const SLA_DURATION_MS = 4 * 60 * 60 * 1000;

// Background sync interval: 60 seconds
const SYNC_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// ReviewService
// ---------------------------------------------------------------------------

export class ReviewService {
  private clickhouse: ClickHouseClient;
  private db: any;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(clickhouse: ClickHouseClient, db: any) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Get the review queue sorted by SLA deadline ascending (most urgent first).
   * For each item, enriches with ClickHouse evidence bundle details.
   */
  async getQueue(
    statusFilter: string = "pending",
    cursor: string | undefined,
    pageSize: number | undefined
  ): Promise<{
    items: ReviewItemResponse[];
    nextCursor: string | null;
    stats: { pending: number; claimed: number; resolvedToday: number; expired: number };
  }> {
    const limit = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // Build WHERE conditions
    const conditions: any[] = [];
    if (statusFilter === "pending") {
      conditions.push(eq(reviewItems.status, "pending"));
    } else if (statusFilter === "claimed") {
      conditions.push(eq(reviewItems.status, "claimed"));
    }
    // "all" = no status filter

    if (cursor) {
      conditions.push(
        sql`(${reviewItems.slaDeadline}, ${reviewItems.id}) > (${new Date(cursor).toISOString()}, '')`
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Query review items from Postgres
    const rows = await this.db
      .select()
      .from(reviewItems)
      .where(whereClause)
      .orderBy(sql`${reviewItems.slaDeadline} ASC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].slaDeadline.toISOString()
        : null;

    // Enrich with ClickHouse bundle details
    const enriched = await this.enrichWithBundleDetails(items);

    // Get stats
    const stats = await this.getQueueStats();

    return { items: enriched, nextCursor, stats };
  }

  /**
   * Claim a review item with optimistic locking.
   * Returns null if the item is already claimed (caller should return 409).
   */
  async claimReview(
    reviewId: string,
    userId: string
  ): Promise<ReviewItemResponse | null> {
    const result = await this.db
      .update(reviewItems)
      .set({
        claimedBy: userId,
        claimedAt: new Date(),
        status: "claimed",
        updatedAt: new Date(),
      })
      .where(
        and(eq(reviewItems.id, reviewId), eq(reviewItems.status, "pending"))
      )
      .returning();

    if (!result || result.length === 0) {
      return null; // Already claimed or not found
    }

    const enriched = await this.enrichWithBundleDetails(result);
    return enriched[0] || null;
  }

  /**
   * Resolve a review item (approve or reject) with mandatory reasoning.
   * The resolution status maps to "approved" or "rejected" based on the category.
   */
  async resolveReview(
    reviewId: string,
    userId: string,
    resolution: string,
    notes: string
  ): Promise<ReviewItemResponse | null> {
    // Validate resolution category
    if (!ALLOWED_RESOLUTIONS.includes(resolution as any)) {
      throw new ValidationError(
        `Invalid resolution. Must be one of: ${ALLOWED_RESOLUTIONS.join(", ")}`
      );
    }

    if (!notes || notes.length < 10) {
      throw new ValidationError(
        "Resolution notes are required and must be at least 10 characters"
      );
    }

    // Determine status: violation_confirmed -> rejected, others -> approved
    const newStatus =
      resolution === "violation_confirmed" ? "rejected" : "approved";

    const result = await this.db
      .update(reviewItems)
      .set({
        resolvedBy: userId,
        resolvedAt: new Date(),
        status: newStatus,
        resolution,
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reviewItems.id, reviewId),
          sql`(${reviewItems.claimedBy} = ${userId} OR ${reviewItems.status} = 'pending')`
        )
      )
      .returning();

    if (!result || result.length === 0) {
      return null;
    }

    const enriched = await this.enrichWithBundleDetails(result);
    return enriched[0] || null;
  }

  /**
   * Get a single review item by ID with full bundle details.
   */
  async getReviewById(reviewId: string): Promise<ReviewItemResponse | null> {
    const rows = await this.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, reviewId))
      .limit(1);

    if (!rows || rows.length === 0) return null;

    const enriched = await this.enrichWithBundleDetails(rows);
    return enriched[0] || null;
  }

  // -------------------------------------------------------------------------
  // Background Jobs
  // -------------------------------------------------------------------------

  /**
   * Start background sync and auto-escalation jobs.
   */
  startBackgroundJobs(): void {
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncEscalations();
      } catch (err) {
        console.error("[reviews] syncEscalations error:", err);
      }
      try {
        await this.autoEscalateExpired();
      } catch (err) {
        console.error("[reviews] autoEscalateExpired error:", err);
      }
    }, SYNC_INTERVAL_MS);

    console.log(
      `[reviews] Background sync started (${SYNC_INTERVAL_MS / 1000}s interval)`
    );
  }

  /**
   * Stop background jobs (for graceful shutdown).
   */
  stopBackgroundJobs(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Sync escalated bundles from ClickHouse to review_items table.
   * Finds bundles with policy_action = 'escalate' from the last hour
   * that do not already have a review_items row.
   */
  async syncEscalations(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Get recent escalated bundles from ClickHouse
    const resultSet = await this.clickhouse.query({
      query: `
        SELECT bundle_id, timestamp
        FROM evidence_bundles
        WHERE policy_action = 'escalate'
          AND timestamp >= {since:DateTime64(3)}
        ORDER BY timestamp DESC
        LIMIT 500
      `,
      format: "JSONEachRow",
      query_params: { since: oneHourAgo },
    });

    const escalatedBundles: Array<{
      bundle_id: string;
      timestamp: string;
    }> = await resultSet.json();

    if (escalatedBundles.length === 0) return 0;

    // Check which bundle_ids already have review items
    const bundleIds = escalatedBundles.map((b) => b.bundle_id);
    const existingRows = await this.db
      .select({ bundleId: reviewItems.bundleId })
      .from(reviewItems)
      .where(inArray(reviewItems.bundleId, bundleIds));

    const existingBundleIds = new Set(
      existingRows.map((r: any) => r.bundleId)
    );

    // Create review items for new escalations
    const newItems = escalatedBundles.filter(
      (b) => !existingBundleIds.has(b.bundle_id)
    );

    if (newItems.length === 0) return 0;

    const insertRows = newItems.map((b) => {
      const escalatedAt = new Date(b.timestamp);
      return {
        bundleId: b.bundle_id,
        escalatedAt,
        slaDeadline: new Date(escalatedAt.getTime() + SLA_DURATION_MS),
        status: "pending",
      };
    });

    await this.db.insert(reviewItems).values(insertRows);

    console.log(
      `[reviews] Synced ${insertRows.length} new escalation(s) to review queue`
    );
    return insertRows.length;
  }

  /**
   * Auto-escalate expired pending review items.
   * Sets status to 'auto_escalated' for items past their SLA deadline.
   */
  async autoEscalateExpired(): Promise<number> {
    const result = await this.db
      .update(reviewItems)
      .set({
        status: "auto_escalated",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reviewItems.status, "pending"),
          lt(reviewItems.slaDeadline, new Date())
        )
      )
      .returning({ id: reviewItems.id });

    const count = result?.length ?? 0;
    if (count > 0) {
      console.log(
        `[reviews] Auto-escalated ${count} expired review item(s)`
      );
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Enrich review items with ClickHouse evidence bundle details.
   */
  private async enrichWithBundleDetails(
    rows: any[]
  ): Promise<ReviewItemResponse[]> {
    if (rows.length === 0) return [];

    const bundleIds = rows.map((r: any) => r.bundleId);

    // Query ClickHouse for bundle details
    let bundleMap = new Map<string, EscalatedBundleRow>();
    try {
      const resultSet = await this.clickhouse.query({
        query: `
          SELECT
            bundle_id,
            timestamp,
            actor_identity,
            vendor,
            model,
            policy_action,
            policy_rules_json,
            prompt_hash,
            response_hash,
            token_count
          FROM evidence_bundles
          WHERE bundle_id IN {ids:Array(String)}
        `,
        format: "JSONEachRow",
        query_params: { ids: bundleIds },
      });

      const bundles: EscalatedBundleRow[] = await resultSet.json();
      for (const b of bundles) {
        bundleMap.set(b.bundle_id, b);
      }
    } catch (err) {
      console.error("[reviews] ClickHouse enrichment error:", err);
    }

    return rows.map((row: any) => {
      const bundle = bundleMap.get(row.bundleId);
      let policyRules: unknown[] = [];
      try {
        if (bundle?.policy_rules_json) {
          policyRules = JSON.parse(bundle.policy_rules_json);
        }
      } catch {
        // Ignore parse errors
      }

      return {
        id: row.id,
        bundleId: row.bundleId,
        escalatedAt: row.escalatedAt?.toISOString?.() ?? row.escalatedAt,
        slaDeadline: row.slaDeadline?.toISOString?.() ?? row.slaDeadline,
        status: row.status,
        claimedBy: row.claimedBy,
        claimedAt: row.claimedAt?.toISOString?.() ?? row.claimedAt,
        resolvedBy: row.resolvedBy,
        resolvedAt: row.resolvedAt?.toISOString?.() ?? row.resolvedAt,
        resolution: row.resolution,
        resolutionNotes: row.resolutionNotes,
        actorIdentity: bundle?.actor_identity ?? "unknown",
        vendor: bundle?.vendor ?? "unknown",
        model: bundle?.model ?? "unknown",
        policyAction: bundle?.policy_action ?? "escalate",
        policyRules,
        riskScore: bundle?.token_count ?? 0, // risk_score not in ClickHouse schema; use token_count as proxy
        promptHash: bundle?.prompt_hash ?? "",
        responseHash: bundle?.response_hash ?? "",
      };
    });
  }

  /**
   * Get queue statistics for the KPI summary cards.
   */
  private async getQueueStats(): Promise<{
    pending: number;
    claimed: number;
    resolvedToday: number;
    expired: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const allRows = await this.db
      .select({
        status: reviewItems.status,
        resolvedAt: reviewItems.resolvedAt,
      })
      .from(reviewItems);

    let pending = 0;
    let claimed = 0;
    let resolvedToday = 0;
    let expired = 0;

    for (const row of allRows) {
      if (row.status === "pending") pending++;
      else if (row.status === "claimed") claimed++;
      else if (row.status === "auto_escalated") expired++;
      else if (
        (row.status === "approved" || row.status === "rejected") &&
        row.resolvedAt &&
        new Date(row.resolvedAt) >= todayStart
      ) {
        resolvedToday++;
      }
    }

    return { pending, claimed, resolvedToday, expired };
  }
}
