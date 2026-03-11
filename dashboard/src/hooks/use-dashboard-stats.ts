"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Response types matching control plane materialized view shapes
// ---------------------------------------------------------------------------

export interface HourlyViolationRecord {
  hour: string;
  policy_action: string;
  violation_count: number;
  unique_actors: number;
  unique_vendors: number;
}

export interface VendorUsageRecord {
  hour: string;
  vendor: string;
  model: string;
  request_count: number;
  total_tokens: number;
  avg_latency_us: number;
}

interface PolicyItem {
  id: string;
  is_active: boolean;
}

interface VendorItem {
  id: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Hourly violations time series
// ---------------------------------------------------------------------------

export function useHourlyViolations(from: string, to: string) {
  return useQuery({
    queryKey: ["audit", "stats", "violations", from, to],
    queryFn: () =>
      api<ApiResponse<HourlyViolationRecord[]>>(
        `/audit/stats/violations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      ),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    select: (res) => res.data,
  });
}

// ---------------------------------------------------------------------------
// Vendor usage time series
// ---------------------------------------------------------------------------

export function useVendorUsage(from: string, to: string) {
  return useQuery({
    queryKey: ["audit", "stats", "vendor-usage", from, to],
    queryFn: () =>
      api<ApiResponse<VendorUsageRecord[]>>(
        `/audit/stats/vendor-usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      ),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    select: (res) => res.data,
  });
}

// ---------------------------------------------------------------------------
// KPI stats (parallel queries for counts)
// ---------------------------------------------------------------------------

export function useActivePoliciesCount() {
  return useQuery({
    queryKey: ["policies", "active-count"],
    queryFn: async () => {
      const res = await api<ApiResponse<{ items: PolicyItem[] }>>(
        "/policies"
      );
      return res.data.items.filter((policy) => policy.is_active).length;
    },
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useApprovedVendorsCount() {
  return useQuery({
    queryKey: ["vendors", "approved-count"],
    queryFn: async () => {
      const res = await api<ApiResponse<{ items: VendorItem[] }>>(
        "/vendors?status=approved"
      );
      return res.data.items.length;
    },
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Derive KPI violation counts from hourly violation data.
 * - Total requests: sum of all violation_count across all action types
 * - Violations today: sum of block + redact violation_count
 */
export function useViolationKpis(violations: HourlyViolationRecord[] | undefined) {
  const totalRequests =
    violations?.reduce((sum, v) => sum + v.violation_count, 0) ?? 0;

  const violationsToday =
    violations
      ?.filter((v) => v.policy_action === "block" || v.policy_action === "redact")
      .reduce((sum, v) => sum + v.violation_count, 0) ?? 0;

  return { totalRequests, violationsToday };
}
