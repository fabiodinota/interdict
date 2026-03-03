"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnomalyAlert, AnomalySummary, ApiResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch anomaly alerts with optional severity filter.
 * Auto-refreshes every 60 seconds.
 */
export function useAnomalies(severityFilter?: string) {
  return useQuery<ApiResponse<AnomalyAlert[]>>({
    queryKey: ["anomalies", severityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (severityFilter) params.set("severity", severityFilter);
      const qs = params.toString();
      return api<ApiResponse<AnomalyAlert[]>>(
        `/anomalies${qs ? `?${qs}` : ""}`
      );
    },
    refetchInterval: 60_000,
  });
}

/**
 * Fetch anomaly summary counts by severity and type.
 * Auto-refreshes every 60 seconds.
 */
export function useAnomalySummary() {
  return useQuery<ApiResponse<AnomalySummary>>({
    queryKey: ["anomalies", "summary"],
    queryFn: () => api<ApiResponse<AnomalySummary>>("/anomalies/summary"),
    refetchInterval: 60_000,
  });
}
