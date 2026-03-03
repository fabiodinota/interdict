"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditFilters {
  vendor?: string;
  department?: string;
  policy_action?: string;
  from_date?: string;
  to_date?: string;
}

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

export interface AuditSearchResponse {
  success: boolean;
  data: AuditRecord[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Server-side audit trail search with filters and cursor-based pagination.
 * Uses keepPreviousData to avoid loading flashes during page changes.
 */
export function useAuditSearch(
  filters: AuditFilters,
  cursor?: string,
  pageSize: number = 50
) {
  return useQuery<AuditSearchResponse>({
    queryKey: ["audit", "search", filters, cursor, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.vendor) params.set("vendor", filters.vendor);
      if (filters.department) params.set("department", filters.department);
      if (filters.policy_action) params.set("policy_action", filters.policy_action);
      if (filters.from_date) params.set("from_date", filters.from_date);
      if (filters.to_date) params.set("to_date", filters.to_date);
      if (cursor) params.set("cursor", cursor);
      params.set("page_size", String(pageSize));

      const qs = params.toString();
      return api<AuditSearchResponse>(`/audit/search${qs ? `?${qs}` : ""}`);
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * Quick hook to fetch vendor names for the filter dropdown.
 * Returns an array of {value, label} for use in Select components.
 */
export function useVendorOptions() {
  return useQuery({
    queryKey: ["vendors", "options"],
    queryFn: async () => {
      const res = await api<{
        success: boolean;
        data: { items: Array<{ id: string; name: string; display_name?: string }> };
      }>("/vendors?page_size=200");
      return (
        res.data?.items?.map((v) => ({
          value: v.name,
          label: v.display_name || v.name,
        })) ?? []
      );
    },
    staleTime: 60_000,
  });
}
