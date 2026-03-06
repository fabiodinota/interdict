/**
 * Reviews Module - Elysia Plugin
 *
 * REST endpoints for the human review queue workflow:
 * queue listing, claim with optimistic locking, and resolve
 * with mandatory category + reasoning.
 *
 * Prefix: /api/v1/reviews
 */

import { Elysia } from "elysia";
import { ReviewService } from "./service";
import { ReviewQueueParams, ResolveReviewBody } from "./model";
import {
  apiResponse,
  paginatedResponse,
  ConflictError,
  NotFoundError,
} from "../../shared/utilities";
import { authPlugin } from "../auth/middleware";
import { db as pgDb } from "../../db/postgres";
import { clickhouse as chClient } from "../../db/clickhouse";

export const reviewsModule = new Elysia({ prefix: "/api/v1/reviews" })
  .use(authPlugin)
  // ---------------------------------------------------------------------------
  // Derive ReviewService from decorated db and clickhouse
  // ---------------------------------------------------------------------------
  .derive(({ store }) => {
    const s = store as { db: any; clickhouse: any };
    return {
      reviewService: new ReviewService(s.clickhouse ?? chClient, s.db ?? pgDb),
    };
  })

  // ---------------------------------------------------------------------------
  // Start background sync jobs on module init
  // ---------------------------------------------------------------------------
  .onStart(({ store }) => {
    const s = store as { db: any; clickhouse: any };
    const service = new ReviewService(s.clickhouse ?? chClient, s.db ?? pgDb);
    service.startBackgroundJobs();
  })

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
