/**
 * Tests for dashboard/src/components/dashboard/VendorUsageChart.tsx
 *
 * Validates chart rendering with recharts fully mocked. Tests data
 * aggregation, loading state, and empty vendor data.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { VendorUsageRecord } from "@/hooks/use-dashboard-stats";

// Mock recharts — happy-dom can't render SVG
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children, data }: { children: ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ children, dataKey }: { children?: ReactNode; dataKey: string }) => (
    <div data-testid="bar" data-key={dataKey}>
      {children}
    </div>
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="x-axis" data-key={dataKey} />
  ),
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
}));

import { VendorUsageChart } from "@/components/dashboard/VendorUsageChart";

const makeRecord = (
  vendor: string,
  model: string,
  count: number,
): VendorUsageRecord => ({
  vendor,
  model,
  request_count: count,
});

describe("VendorUsageChart", () => {
  it("renders chart with aggregated vendor data", () => {
    const data: VendorUsageRecord[] = [
      makeRecord("OpenAI", "gpt-4", 100),
      makeRecord("OpenAI", "gpt-3.5", 50),
      makeRecord("Anthropic", "claude-3", 200),
    ];

    render(<VendorUsageChart data={data} isLoading={false} />);

    expect(screen.getByText("Vendor Usage")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();

    // Verify aggregated data (sorted by request count descending)
    const chart = screen.getByTestId("bar-chart");
    const rows = JSON.parse(chart.getAttribute("data-rows") ?? "[]");
    expect(rows).toEqual([
      { vendor: "Anthropic", requestCount: 200, models: "claude-3" },
      { vendor: "OpenAI", requestCount: 150, models: expect.stringContaining("gpt-4") },
    ]);
  });

  it("renders loading skeleton when isLoading and no data", () => {
    render(<VendorUsageChart data={undefined} isLoading={true} />);

    expect(screen.getByText("Vendor Usage")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("renders chart with empty data array (no vendors)", () => {
    render(<VendorUsageChart data={[]} isLoading={false} />);

    const chart = screen.getByTestId("bar-chart");
    const rows = JSON.parse(chart.getAttribute("data-rows") ?? "[]");
    expect(rows).toEqual([]);
  });

  it("uses requestCount as bar dataKey", () => {
    const data: VendorUsageRecord[] = [makeRecord("OpenAI", "gpt-4", 10)];

    render(<VendorUsageChart data={data} isLoading={false} />);

    expect(screen.getByTestId("bar")).toHaveAttribute("data-key", "requestCount");
  });
});
