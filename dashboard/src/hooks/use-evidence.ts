"use client";

import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EvidenceBundle, VerificationResult } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceBundlesFilters {
  from_date?: string;
  to_date?: string;
}

export interface EvidenceBundlesResponse {
  success: boolean;
  data: EvidenceBundle[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface VerifyBundlesResponse {
  success: boolean;
  data: VerificationResult[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch paginated evidence bundles with optional date filters.
 * Uses keepPreviousData to avoid loading flashes during page changes.
 */
export function useEvidenceBundles(
  filters: EvidenceBundlesFilters,
  cursor?: string,
  pageSize: number = 50,
) {
  return useQuery<EvidenceBundlesResponse>({
    queryKey: ["evidence", "bundles", filters, cursor, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from_date) params.set("from_date", filters.from_date);
      if (filters.to_date) params.set("to_date", filters.to_date);
      if (cursor) params.set("cursor", cursor);
      params.set("page_size", String(pageSize));

      const qs = params.toString();
      return api<EvidenceBundlesResponse>(`/evidence/bundles${qs ? `?${qs}` : ""}`);
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * Mutation hook for verifying evidence bundles.
 * Accepts an array of bundle_ids and returns per-bundle verification results.
 */
export function useVerifyBundles() {
  return useMutation<VerifyBundlesResponse, Error, string[]>({
    mutationFn: (bundleIds: string[]) =>
      api<VerifyBundlesResponse>("/evidence/verify", {
        method: "POST",
        body: JSON.stringify({ bundle_ids: bundleIds }),
      }),
  });
}
