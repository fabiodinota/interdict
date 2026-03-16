"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VendorUsageRecord } from "@/hooks/use-dashboard-stats";

interface VendorUsageChartProps {
  data: VendorUsageRecord[] | undefined;
  isLoading: boolean;
}

const VENDOR_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/**
 * Aggregate vendor usage records by vendor name.
 * The raw data has per-hour, per-model rows -- we want total request_count per vendor.
 */
function aggregateByVendor(records: VendorUsageRecord[]) {
  const map = new Map<string, { requestCount: number; models: Set<string> }>();

  for (const r of records) {
    const existing = map.get(r.vendor) ?? {
      requestCount: 0,
      models: new Set<string>(),
    };
    existing.requestCount += r.request_count;
    existing.models.add(r.model);
    map.set(r.vendor, existing);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.requestCount - a.requestCount)
    .map(([vendor, info]) => ({
      vendor,
      requestCount: info.requestCount,
      models: Array.from(info.models).join(", "),
    }));
}

interface VendorTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: { vendor: string; requestCount: number; models: string };
  }>;
}

function CustomTooltip({ active, payload }: VendorTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <p className="text-sm font-medium">{item.vendor}</p>
      <p className="text-xs text-muted-foreground">Models: {item.models}</p>
      <p className="text-sm font-semibold">
        {new Intl.NumberFormat("en-US").format(item.requestCount)} requests
      </p>
    </div>
  );
}

export function VendorUsageChart({ data, isLoading }: VendorUsageChartProps) {
  const chartData = useMemo(() => (data ? aggregateByVendor(data) : []), [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="vendor"
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="requestCount" name="Requests" radius={[4, 4, 0, 0]}>
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={VENDOR_COLORS[index % VENDOR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
