/**
 * Reviews Module - Elysia Plugin
 *
 * REST endpoints for the human review queue workflow:
 * queue listing, claim with optimistic locking, resolve
 * with mandatory category + reasoning, and deterministic
 * review creation via evidence ingest webhook.
 *
 * Architecture (Phase 20):
 * - POST /ingest creates review items deterministically at evidence ingest time.
 * - Background reconciler catches missed escalations (catch-up, not primary path).
 * - ClickHouse is read-model only for enrichment.
 *
 * Prefix: /api/v1/reviews
 */

import { Elysia, t } from "elysia";
import { ReviewService } from "./service";
import { ReviewQueueParams, ResolveReviewBody } from "./model";
import {
  apiResponse,
  ConflictError,
  NotFoundError,
} from "../../shared/utilities";
import type { AppStore } from "../../shared/types";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

export const reviewsModule = new Elysia({ prefix: "/api/v1/reviews" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive ReviewService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    return {
      reviewService: new ReviewService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // Start background reconciliation jobs on module init
  // ---------------------------------------------------------------------------
  .onStart(({ store }) => {
    const s = store as unknown as Partial<AppStore>;
    const service = new ReviewService(s.clickhouse ?? chClient, s.db ?? pgDb);
    service.startBackgroundJobs();
  })

  // ---------------------------------------------------------------------------
  // POST /ingest -- Deterministic review creation (called at evidence ingest)
  // ---------------------------------------------------------------------------
  .post(
    "/ingest",
    async (ctx: any) => {
      const { bundle_id, escalated_at, source } = ctx.body;
      const escalatedDate = new Date(escalated_at);
      if (isNaN(escalatedDate.getTime())) {
        ctx.set.status = 400;
        return { success: false, error: "Invalid escalated_at timestamp" };
      }

      const result = await ctx.reviewService.createReviewItem(
        bundle_id,
        escalatedDate,
        source ?? "kernel_l3"
      );

      ctx.set.status = result.created ? 201 : 200;
      return {
        success: true,
        data: { id: result.id, created: result.created },
      };
    },
    {
      // Internal endpoint: called by evidence-collector or kernel services.
      // No user-level auth required — service-to-service authentication
      // is handled by mTLS at the transport layer.
      body: t.Object({
        bundle_id: t.String({ minLength: 1 }),
        escalated_at: t.String(),
        source: t.Optional(
          t.Union([
            t.Literal("kernel_l3"),
            t.Literal("session_pattern"),
          ])
        ),
      }),
    }
  )

  // ---------------------------------------------------------------------------
  // GET /queue -- Paginated review queue sorted by SLA urgency
  // ---------------------------------------------------------------------------
  .get(
    "/queue",
    async (ctx: any) => {
      const statusFilter = ctx.query.status || "pending";
      const pageSize = ctx.query.page_size
        ? parseInt(String(ctx.query.page_size), 10)
        : undefined;

      const result = await ctx.reviewService.getQueue(
        statusFilter,
        ctx.query.cursor,
        pageSize
      );

      return {
        success: true,
        data: result.items,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null,
        },
        stats: result.stats,
      };
    },
    {
      auth: ["compliance_officer"],
      query: ReviewQueueParams,
    }
  )

  // ---------------------------------------------------------------------------
  // GET /:id -- Single review item with full bundle details
  // ---------------------------------------------------------------------------
  .get(
    "/:id",
    async (ctx: any) => {
      const item = await ctx.reviewService.getReviewById(ctx.params.id);
      if (!item) {
        throw new NotFoundError("Review item not found");
      }
      return apiResponse(item);
    },
    {
      auth: ["compliance_officer"],
    }
  )

  // ---------------------------------------------------------------------------
  // POST /:id/claim -- Claim a review item (optimistic lock)
  // ---------------------------------------------------------------------------
  .post(
    "/:id/claim",
    async (ctx: any) => {
      const item = await ctx.reviewService.claimReview(
        ctx.params.id,
        ctx.user.id
      );

      if (!item) {
        throw new ConflictError(
          "Review item already claimed by another reviewer or not found"
        );
      }

      return apiResponse(item);
    },
    {
      auth: ["compliance_officer"],
    }
  )

  // ---------------------------------------------------------------------------
  // POST /:id/resolve -- Resolve with mandatory category + reasoning
  // ---------------------------------------------------------------------------
  .post(
    "/:id/resolve",
    async (ctx: any) => {
      const item = await ctx.reviewService.resolveReview(
        ctx.params.id,
        ctx.user.id,
        ctx.body.resolution,
        ctx.body.resolution_notes
      );

      if (!item) {
        throw new NotFoundError(
          "Review item not found or not claimed by you"
        );
      }

      return apiResponse(item);
    },
    {
      auth: ["compliance_officer"],
      body: ResolveReviewBody,
    }
  );
