/**
 * Review Service
 *
 * Business logic for the human review queue. Manages review items
 * with optimistic locking on claims, mandatory resolution validation,
 * and deterministic review creation.
 *
 * Architecture (Phase 20):
 * - Postgres `review_items` is the single authoritative workflow store.
 * - ClickHouse is read-model only: used for enrichment (actor, vendor, etc.)
 *   but never as the source of workflow state.
 * - Review items are created deterministically via `createReviewItem()`,
 *   called from the evidence ingest endpoint when `policy_action = 'escalate'`.
 * - A background reconciler (`reconcileEscalations`) runs as catch-up only,
 *   not as the primary creation path.
 * - `bundle_id` has a UNIQUE constraint — duplicate creation is idempotent.
 */

import type { ClickHouseClient } from "@clickhouse/client";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { reviewItems } from "../../db/schema/reviews";
import type { AppDb } from "../../shared/types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, ValidationError } from "../../shared/utilities";
import { ALLOWED_RESOLUTIONS, type EscalatedBundleRow, type ReviewItemResponse } from "./model";

// SLA duration: 4 hours in milliseconds
const SLA_DURATION_MS = 4 * 60 * 60 * 1000;

// Background reconciliation interval: 5 minutes (catch-up, not primary path).
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

function toDatePartition(value: Date | string): string {
  return value instanceof Date ? value.toISOString().substring(0, 10) : value.substring(0, 10);
}

// ---------------------------------------------------------------------------
// ReviewService
// ---------------------------------------------------------------------------

export class ReviewService {
  private clickhouse: ClickHouseClient;
  private db: AppDb;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(clickhouse: ClickHouseClient, db: AppDb) {
    this.clickhouse = clickhouse;
    this.db = db;
  }

  // -------------------------------------------------------------------------
  // Deterministic Review Creation (Phase 20)
  // -------------------------------------------------------------------------

  /**
   * Create a review item for an escalated evidence bundle.
   *
   * This is the primary creation path — called at evidence ingest time
   * when `policy_action = 'escalate'`.
   *
   * Idempotent: if a review item for this `bundleId` already exists,
   * returns the existing item without error (UNIQUE constraint on bundle_id).
   *
   * @param bundleId  - Evidence bundle ID from ClickHouse
   * @param escalatedAt - Timestamp when the escalation occurred
   * @param source - Escalation source: "kernel_l3" or "session_pattern"
   * @returns The created (or existing) review item ID, or null if insert was a no-op.
   */
  async createReviewItem(
    bundleId: string,
    escalatedAt: Date,
    source: "kernel_l3" | "session_pattern" = "kernel_l3",
  ): Promise<{ id: string; created: boolean }> {
    const slaDeadline = new Date(escalatedAt.getTime() + SLA_DURATION_MS);

    try {
      const result = await this.db
        .insert(reviewItems)
        .values({
          bundleId,
          escalatedAt,
          slaDeadline,
          status: "pending",
          escalationSource: source,
        })
        .onConflictDoNothing({ target: reviewItems.bundleId })
        .returning({ id: reviewItems.id });

      if (result && result.length > 0) {
        return { id: result[0].id, created: true };
      }

      // Conflict: review already exists for this bundle. Look it up.
      const existing = await this.db
        .select({ id: reviewItems.id })
        .from(reviewItems)
        .where(eq(reviewItems.bundleId, bundleId))
        .limit(1);

      return {
        id: existing[0]?.id ?? bundleId,
        created: false,
      };
    } catch (err: unknown) {
      // Handle race condition: UNIQUE violation from concurrent inserts.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("unique") || message.includes("duplicate")) {
        const existing = await this.db
          .select({ id: reviewItems.id })
          .from(reviewItems)
          .where(eq(reviewItems.bundleId, bundleId))
          .limit(1);

        return {
          id: existing[0]?.id ?? bundleId,
          created: false,
        };
      }
      throw err;
    }
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
    pageSize: number | undefined,
  ): Promise<{
    items: ReviewItemResponse[];
    nextCursor: string | null;
    stats: { pending: number; claimed: number; resolvedToday: number; expired: number };
  }> {
    const limit = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [];
    if (statusFilter === "pending") {
      conditions.push(eq(reviewItems.status, "pending"));
    } else if (statusFilter === "claimed") {
      conditions.push(eq(reviewItems.status, "claimed"));
    }
    // "all" = no status filter

    if (cursor) {
      conditions.push(
        sql`(${reviewItems.slaDeadline}, ${reviewItems.id}) > (${new Date(cursor).toISOString()}, '')`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
      hasMore && items.length > 0 ? items[items.length - 1].slaDeadline.toISOString() : null;

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
  async claimReview(reviewId: string, userId: string): Promise<ReviewItemResponse | null> {
    const result = await this.db
      .update(reviewItems)
      .set({
        claimedBy: userId,
        claimedAt: new Date(),
        status: "claimed",
        updatedAt: new Date(),
      })
      .where(and(eq(reviewItems.id, reviewId), eq(reviewItems.status, "pending")))
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
    notes: string,
  ): Promise<ReviewItemResponse | null> {
    // Validate resolution category
    if (!(ALLOWED_RESOLUTIONS as readonly string[]).includes(resolution)) {
      throw new ValidationError(
        `Invalid resolution. Must be one of: ${ALLOWED_RESOLUTIONS.join(", ")}`,
      );
    }

    if (!notes || notes.length < 10) {
      throw new ValidationError("Resolution notes are required and must be at least 10 characters");
    }

    // Determine status: violation_confirmed -> rejected, others -> approved
    const newStatus = resolution === "violation_confirmed" ? "rejected" : "approved";

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
          sql`(${reviewItems.claimedBy} = ${userId} OR ${reviewItems.status} = 'pending')`,
        ),
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
  // Background Reconciliation (catch-up only, not primary creation path)
  // -------------------------------------------------------------------------

  /**
   * Start background reconciliation and auto-escalation jobs.
   *
   * The reconciler is a safety net: it catches any escalated bundles that
   * were missed by the primary deterministic creation path (e.g., if the
   * control plane was down during evidence ingest). It runs every 5 minutes
   * instead of every 60 seconds, since it is no longer the primary path.
   */
  startBackgroundJobs(): void {
    this.reconcileTimer = setInterval(async () => {
      try {
        await this.reconcileEscalations();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[reviews] reconcileEscalations error:", message);
      }
      try {
        await this.autoEscalateExpired();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[reviews] autoEscalateExpired error:", message);
      }
    }, RECONCILE_INTERVAL_MS);

    console.log(
      `[reviews] Background reconciliation started (${RECONCILE_INTERVAL_MS / 1000}s interval, catch-up only)`,
    );
  }

  /**
   * Stop background jobs (for graceful shutdown).
   */
  stopBackgroundJobs(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  /**
   * Reconcile escalated bundles from ClickHouse into review_items.
   *
   * This is the catch-up reconciler — NOT the primary creation path.
   * It finds escalated bundles in ClickHouse that don't yet have a
   * corresponding review_items row and creates them idempotently.
   *
   * Returns the number of newly created review items.
   */
  async reconcileEscalations(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Get recent escalated bundles from ClickHouse
    const resultSet = await this.clickhouse.query({
      query: `
        SELECT bundle_id, timestamp
        FROM evidence_bundles
        WHERE policy_action = 'escalate'
          AND event_date >= {from_date:String}
          AND timestamp >= {since:DateTime64(3)}
        ORDER BY timestamp DESC
        LIMIT 500
      `,
      format: "JSONEachRow",
      query_params: {
        from_date: toDatePartition(oneHourAgo),
        since: oneHourAgo.toISOString().replace("Z", ""),
      },
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

    const existingBundleIds = new Set(existingRows.map((r) => r.bundleId));

    // Create review items for new escalations (idempotent via UNIQUE constraint)
    const newItems = escalatedBundles.filter((b) => !existingBundleIds.has(b.bundle_id));

    if (newItems.length === 0) return 0;

    let created = 0;
    for (const b of newItems) {
      const result = await this.createReviewItem(b.bundle_id, new Date(b.timestamp), "kernel_l3");
      if (result.created) created++;
    }

    if (created > 0) {
      console.log(`[reviews] Reconciler created ${created} review item(s) (catch-up)`);
    }
    return created;
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
      .where(and(eq(reviewItems.status, "pending"), lt(reviewItems.slaDeadline, new Date())))
      .returning({ id: reviewItems.id });

    const count = result?.length ?? 0;
    if (count > 0) {
      console.log(`[reviews] Auto-escalated ${count} expired review item(s)`);
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Enrich review items with ClickHouse evidence bundle details.
   * ClickHouse is read-model only — enrichment failure does not break the queue.
   */
  private async enrichWithBundleDetails(
    rows: Array<typeof reviewItems.$inferSelect>,
  ): Promise<ReviewItemResponse[]> {
    if (rows.length === 0) return [];

    const bundleIds = rows.map((r) => r.bundleId);
    const eventDates = Array.from(
      new Set(rows.map((row) => toDatePartition(row.escalatedAt ?? row.createdAt ?? new Date()))),
    );

    // Query ClickHouse for bundle details
    const bundleMap = new Map<string, EscalatedBundleRow>();
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
          WHERE event_date IN {event_dates:Array(String)}
            AND bundle_id IN {ids:Array(String)}
        `,
        format: "JSONEachRow",
        query_params: { event_dates: eventDates, ids: bundleIds },
      });

      const bundles: EscalatedBundleRow[] = await resultSet.json();
      for (const b of bundles) {
        bundleMap.set(b.bundle_id, b);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[reviews] ClickHouse enrichment failed (read-model only, queue unaffected):",
        message,
      );
    }

    return rows.map((row) => {
      const bundle = bundleMap.get(row.bundleId);
      let policyRules: unknown[] = [];
      try {
        if (bundle?.policy_rules_json) {
          policyRules = JSON.parse(bundle.policy_rules_json);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[reviews] Failed to parse policy_rules_json for bundle ${row.bundleId}: ${message}`,
        );
      }

      return {
        id: row.id,
        bundleId: row.bundleId,
        escalatedAt: row.escalatedAt?.toISOString() ?? null,
        slaDeadline: row.slaDeadline?.toISOString() ?? null,
        status: row.status,
        claimedBy: row.claimedBy,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        resolvedBy: row.resolvedBy,
        resolvedAt:
          row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : (row.resolvedAt ?? null),
        resolution: row.resolution,
        resolutionNotes: row.resolutionNotes,
        escalationSource: row.escalationSource ?? null,
        actorIdentity: bundle?.actor_identity ?? "unknown",
        vendor: bundle?.vendor ?? "unknown",
        model: bundle?.model ?? "unknown",
        policyAction: bundle?.policy_action ?? "escalate",
        policyRules,
        riskScore: bundle?.token_count ?? 0,
        promptHash: bundle?.prompt_hash ?? "",
        responseHash: bundle?.response_hash ?? "",
      };
    });
  }

  /**
   * Get queue statistics for the KPI summary cards.
   * Uses COUNT aggregation instead of loading all rows.
   */
  private async getQueueStats(): Promise<{
    pending: number;
    claimed: number;
    resolvedToday: number;
    expired: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Single query with conditional counts instead of loading all rows.
    const result = await this.db
      .select({
        pending: sql<number>`count(*) filter (where ${reviewItems.status} = 'pending')`,
        claimed: sql<number>`count(*) filter (where ${reviewItems.status} = 'claimed')`,
        expired: sql<number>`count(*) filter (where ${reviewItems.status} = 'auto_escalated')`,
        resolvedToday: sql<number>`count(*) filter (where ${reviewItems.status} in ('approved', 'rejected') and ${reviewItems.resolvedAt} >= ${todayStart.toISOString()})`,
      })
      .from(reviewItems);

    const row = result[0];
    return {
      pending: Number(row?.pending ?? 0),
      claimed: Number(row?.claimed ?? 0),
      resolvedToday: Number(row?.resolvedToday ?? 0),
      expired: Number(row?.expired ?? 0),
    };
  }
}
