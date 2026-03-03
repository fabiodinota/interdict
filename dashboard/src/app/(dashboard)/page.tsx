"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { TimeRangeSelector, getDateRange } from "@/components/dashboard/TimeRangeSelector";
import type { TimeRange } from "@/components/dashboard/TimeRangeSelector";
import { ViolationChart } from "@/components/dashboard/ViolationChart";
import { VendorUsageChart } from "@/components/dashboard/VendorUsageChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  useHourlyViolations,
  useVendorUsage,
  useActivePoliciesCount,
  useApprovedVendorsCount,
  useViolationKpis,
} from "@/hooks/use-dashboard-stats";

export default function HomePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const { from, to } = getDateRange(timeRange);

  // Data hooks
  const violations = useHourlyViolations(from, to);
  const vendorUsage = useVendorUsage(from, to);
  const activePolicies = useActivePoliciesCount();
  const approvedVendors = useApprovedVendorsCount();

  // Derive KPI values from violation data
  const { totalRequests, violationsToday } = useViolationKpis(violations.data);

  // Track when data was last fetched
  if (
    violations.dataUpdatedAt &&
    (!lastUpdated || violations.dataUpdatedAt > lastUpdated.getTime())
  ) {
    // Schedule the state update to avoid setting state during render
    queueMicrotask(() => setLastUpdated(new Date(violations.dataUpdatedAt)));
  }

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["audit", "stats"] });
    queryClient.invalidateQueries({ queryKey: ["policies"] });
    queryClient.invalidateQueries({ queryKey: ["vendors"] });
    setLastUpdated(new Date());
  }, [queryClient]);

  const isKpiLoading =
    violations.isLoading || activePolicies.isLoading || approvedVendors.isLoading;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Real-time overview of AI governance activity
        </p>
      </div>

      {/* KPI Cards */}
      <KpiCards
        totalRequests={totalRequests}
        violationsToday={violationsToday}
        activePolicies={activePolicies.data}
        activeVendors={approvedVendors.data}
        isLoading={isKpiLoading}
      />

      {/* Time Range Selector */}
      <TimeRangeSelector
        value={timeRange}
        onChange={setTimeRange}
        onRefresh={handleRefresh}
        lastUpdated={lastUpdated}
      />

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ViolationChart
          data={violations.data}
          isLoading={violations.isLoading}
        />
        <VendorUsageChart
          data={vendorUsage.data}
          isLoading={vendorUsage.isLoading}
        />
      </div>

      {/* Live Activity Feed (SSE-powered, independent of time range) */}
      <ActivityFeed />
    </div>
  );
}
