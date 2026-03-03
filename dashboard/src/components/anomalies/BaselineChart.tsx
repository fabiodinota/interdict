"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { AnomalyAlert } from "@/types/api";

// ---------------------------------------------------------------------------
// Compact inline bar chart comparing baseline vs current
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<AnomalyAlert["severity"], string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  critical: "#ef4444",
};

interface BaselineChartProps {
  baseline: number;
  current: number;
  severity: AnomalyAlert["severity"];
}

export function BaselineChart({
  baseline,
  current,
  severity,
}: BaselineChartProps) {
  const data = [
    { name: "Baseline", value: baseline },
    { name: "Current", value: current },
  ];

  const colors = ["#9ca3af", SEVERITY_COLORS[severity]];

  return (
    <div className="h-20 w-48 flex-shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%">
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={colors[idx]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
