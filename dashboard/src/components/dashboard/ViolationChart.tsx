"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { HourlyViolationRecord } from "@/hooks/use-dashboard-stats";

interface ViolationChartProps {
  data: HourlyViolationRecord[] | undefined;
  isLoading: boolean;
}

const ACTION_COLORS: Record<string, string> = {
  allow: "var(--color-chart-2)", // green-ish
  block: "var(--color-destructive)", // red
  redact: "var(--color-chart-1)", // orange-ish
};

const ACTION_LABELS: Record<string, string> = {
  allow: "Allow",
  block: "Block",
  redact: "Redact",
};

/**
 * Pivot the flat violation records into { hour, allow, block, redact } rows
 * so Recharts can draw one line per action type.
 */
function pivotData(records: HourlyViolationRecord[]) {
  const map = new Map<string, Record<string, number>>();

  for (const r of records) {
    const existing = map.get(r.hour) ?? {};
    existing[r.policy_action] = (existing[r.policy_action] ?? 0) + r.violation_count;
    map.set(r.hour, existing);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, actions]) => ({
      hour,
      allow: actions.allow ?? 0,
      block: actions.block ?? 0,
      redact: actions.redact ?? 0,
    }));
}

function formatHour(value: string) {
  try {
    return format(parseISO(value), "MMM d, HH:mm");
  } catch {
    return value;
  }
}

export function ViolationChart({ data, isLoading }: ViolationChartProps) {
  const chartData = useMemo(() => (data ? pivotData(data) : []), [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Violation Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--color-muted-foreground)" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  borderColor: "var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
                labelFormatter={formatHour}
              />
              <Legend />
              {(["allow", "block", "redact"] as const).map((action) => (
                <Line
                  key={action}
                  type="monotone"
                  dataKey={action}
                  name={ACTION_LABELS[action]}
                  stroke={ACTION_COLORS[action]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
