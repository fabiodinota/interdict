"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { ReviewItem, ReviewResolution } from "@/types/api";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface ReviewQueueResponse {
  success: boolean;
  data: ReviewItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  stats: {
    pending: number;
    claimed: number;
    resolvedToday: number;
    expired: number;
  };
}

export interface ReviewItemResponse {
  success: boolean;
  data: ReviewItem;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch the review queue with status filter and cursor pagination.
 * Refetches every 30 seconds to keep SLA timers reasonably accurate.
 */
export function useReviewQueue(
  statusFilter: string = "pending",
  cursor?: string,
  pageSize: number = 50
) {
  return useQuery<ReviewQueueResponse>({
    queryKey: ["reviews", "queue", statusFilter, cursor, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      } else {
        params.set("status", "all");
      }
      if (cursor) params.set("cursor", cursor);
      params.set("page_size", String(pageSize));

      const qs = params.toString();
      return api<ReviewQueueResponse>(`/reviews/queue${qs ? `?${qs}` : ""}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

/**
 * Fetch a single review item by ID with full bundle details.
 */
export function useReviewDetail(id: string | null) {
  return useQuery<ReviewItemResponse>({
    queryKey: ["reviews", "detail", id],
    queryFn: () => api<ReviewItemResponse>(`/reviews/${id}`),
    enabled: !!id,
  });
}

/**
 * Claim a review item. On 409, shows toast about item already being claimed.
 */
export function useClaimReview() {
  const queryClient = useQueryClient();

  return useMutation<ReviewItemResponse, Error, string>({
    mutationFn: (reviewId: string) =>
      api<ReviewItemResponse>(`/reviews/${reviewId}/claim`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Item already claimed", {
          description: "Another reviewer has already claimed this item.",
        });
      } else {
        toast.error("Failed to claim review item", {
          description: error.message,
        });
      }
    },
  });
}

/**
 * Resolve a review item with mandatory category and reasoning.
 */
export function useResolveReview() {
  const queryClient = useQueryClient();

  return useMutation<
    ReviewItemResponse,
    Error,
    { reviewId: string; resolution: ReviewResolution; resolution_notes: string }
  >({
    mutationFn: ({ reviewId, resolution, resolution_notes }) =>
      api<ReviewItemResponse>(`/reviews/${reviewId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, resolution_notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      toast.success("Review resolved successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to resolve review", {
        description: error.message,
      });
    },
  });
}
