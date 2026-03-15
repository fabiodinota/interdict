/**
 * Tests for dashboard/src/components/anomalies/BaselineChart.tsx
 *
 * Validates chart rendering with recharts fully mocked (happy-dom cannot
 * render SVG). Asserts data labels and structure without SVG rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock recharts — happy-dom can't render SVG
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children, data }: { children: ReactNode; data: Array<{ name: string; value: number }> }) => (
    <div data-testid="bar-chart" data-bars={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ children }: { children?: ReactNode }) => (
    <div data-testid="bar">{children}</div>
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="x-axis" data-key={dataKey} />
  ),
  YAxis: () => <div data-testid="y-axis" />,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
}));

import { BaselineChart } from "@/components/anomalies/BaselineChart";

describe("BaselineChart", () => {
  it("renders chart with baseline and current data", () => {
    render(<BaselineChart baseline={100} current={500} severity="warning" />);

    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();

    // Verify data passed to chart
    const chart = screen.getByTestId("bar-chart");
    const data = JSON.parse(chart.getAttribute("data-bars") ?? "[]");
    expect(data).toEqual([
      { name: "Baseline", value: 100 },
      { name: "Current", value: 500 },
    ]);
  });

  it("uses correct severity colors for cells", () => {
    render(<BaselineChart baseline={50} current={200} severity="critical" />);

    const cells = screen.getAllByTestId("cell");
    expect(cells).toHaveLength(2);
    // First cell is baseline (gray), second is severity color (critical = red)
    expect(cells[0]).toHaveAttribute("data-fill", "#9ca3af");
    expect(cells[1]).toHaveAttribute("data-fill", "#ef4444");
  });

  it("handles zero values without errors", () => {
    render(<BaselineChart baseline={0} current={0} severity="info" />);

    const chart = screen.getByTestId("bar-chart");
    const data = JSON.parse(chart.getAttribute("data-bars") ?? "[]");
    expect(data).toEqual([
      { name: "Baseline", value: 0 },
      { name: "Current", value: 0 },
    ]);
  });
});
