/**
 * Tests for dashboard/src/components/dashboard/ViolationChart.tsx
 *
 * Validates chart rendering with recharts fully mocked (happy-dom cannot
 * render SVG). Tests data pivoting, loading state, and empty data.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { HourlyViolationRecord } from "@/hooks/use-dashboard-stats";

// Mock recharts — happy-dom can't render SVG
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children, data }: { children: ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name }: { dataKey: string; name: string }) => (
    <div data-testid={`line-${dataKey}`} data-name={name} />
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="x-axis" data-key={dataKey} />
  ),
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

import { ViolationChart } from "@/components/dashboard/ViolationChart";

const makeRecord = (
  hour: string,
  action: string,
  count: number,
): HourlyViolationRecord => ({
  hour,
  policy_action: action,
  violation_count: count,
});

describe("ViolationChart", () => {
  it("renders chart with pivoted data from violation records", () => {
    const data: HourlyViolationRecord[] = [
      makeRecord("2025-01-01T01:00:00Z", "allow", 10),
      makeRecord("2025-01-01T01:00:00Z", "block", 5),
      makeRecord("2025-01-01T02:00:00Z", "redact", 3),
    ];

    render(<ViolationChart data={data} isLoading={false} />);

    expect(screen.getByText("Violation Trends")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();

    // Verify pivoted data
    const chart = screen.getByTestId("line-chart");
    const rows = JSON.parse(chart.getAttribute("data-rows") ?? "[]");
    expect(rows).toEqual([
      { hour: "2025-01-01T01:00:00Z", allow: 10, block: 5, redact: 0 },
      { hour: "2025-01-01T02:00:00Z", allow: 0, block: 0, redact: 3 },
    ]);
  });

  it("renders three Line components for allow, block, redact", () => {
    const data: HourlyViolationRecord[] = [
      makeRecord("2025-01-01T01:00:00Z", "allow", 1),
    ];

    render(<ViolationChart data={data} isLoading={false} />);

    expect(screen.getByTestId("line-allow")).toHaveAttribute("data-name", "Allow");
    expect(screen.getByTestId("line-block")).toHaveAttribute("data-name", "Block");
    expect(screen.getByTestId("line-redact")).toHaveAttribute("data-name", "Redact");
  });

  it("renders loading skeleton when isLoading and no data", () => {
    render(<ViolationChart data={undefined} isLoading={true} />);

    expect(screen.getByText("Violation Trends")).toBeInTheDocument();
    // Skeleton rendered instead of chart
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("renders chart with empty data array (no crash)", () => {
    render(<ViolationChart data={[]} isLoading={false} />);

    const chart = screen.getByTestId("line-chart");
    const rows = JSON.parse(chart.getAttribute("data-rows") ?? "[]");
    expect(rows).toEqual([]);
  });
});
