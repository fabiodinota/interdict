/**
 * Tests for dashboard/src/components/anomalies/AnomalyCard.tsx
 *
 * Validates card rendering with different severity levels and anomaly types,
 * baseline/current data display, action buttons, and BaselineChart mock.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AnomalyAlert } from "@/types/api";

// Mock BaselineChart to avoid recharts SVG rendering
vi.mock("@/components/anomalies/BaselineChart", () => ({
  BaselineChart: ({
    baseline,
    current,
    severity,
  }: {
    baseline: number;
    current: number;
    severity: string;
  }) => (
    <div
      data-testid="baseline-chart"
      data-baseline={baseline}
      data-current={current}
      data-severity={severity}
    />
  ),
}));

import { AnomalyCard } from "@/components/anomalies/AnomalyCard";

const makeAlert = (overrides: Partial<AnomalyAlert> = {}): AnomalyAlert => ({
  type: "volume_spike",
  severity: "warning",
  actorIdentity: "user@example.com",
  summary: "Volume spike detected for user",
  baseline: { avg_count: 100 },
  current: { current_count: 500 },
  detectedAt: "2025-06-01T12:00:00Z",
  actions: [{ label: "View Audit Log", href: "/audit" }],
  ...overrides,
});

describe("AnomalyCard", () => {
  it("renders card with type label and severity badge", () => {
    render(<AnomalyCard alert={makeAlert()} />);

    expect(screen.getByText("Volume Spike")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Volume spike detected for user")).toBeInTheDocument();
  });

  it("renders different anomaly types correctly", () => {
    render(<AnomalyCard alert={makeAlert({ type: "off_hours" })} />);
    expect(screen.getByText("Off-Hours Usage")).toBeInTheDocument();
  });

  it("renders critical severity badge", () => {
    render(<AnomalyCard alert={makeAlert({ severity: "critical" })} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders info severity badge", () => {
    render(<AnomalyCard alert={makeAlert({ severity: "info" })} />);
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("renders baseline and current data labels", () => {
    render(
      <AnomalyCard
        alert={makeAlert({
          baseline: { avg_count: 50, window: "7d" },
          current: { current_count: 200 },
        })}
      />,
    );

    expect(screen.getByText(/Baseline avg_count/)).toBeInTheDocument();
    expect(screen.getByText(/50/)).toBeInTheDocument();
    expect(screen.getByText(/Current current_count/)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
  });

  it("renders action buttons as links", () => {
    render(
      <AnomalyCard
        alert={makeAlert({
          actions: [
            { label: "View Audit Log", href: "/audit" },
            { label: "View Policy", href: "/policies/1" },
          ],
        })}
      />,
    );

    expect(screen.getByText("View Audit Log")).toBeInTheDocument();
    expect(screen.getByText("View Policy")).toBeInTheDocument();
  });

  it("renders BaselineChart for volume_spike type with numeric baseline/current", () => {
    render(
      <AnomalyCard
        alert={makeAlert({
          type: "volume_spike",
          baseline: { avg_count: 100 },
          current: { current_count: 500 },
        })}
      />,
    );

    const chart = screen.getByTestId("baseline-chart");
    expect(chart).toHaveAttribute("data-baseline", "100");
    expect(chart).toHaveAttribute("data-current", "500");
    expect(chart).toHaveAttribute("data-severity", "warning");
  });

  it("does not render BaselineChart for non-volume_spike types", () => {
    render(
      <AnomalyCard
        alert={makeAlert({
          type: "topic_drift",
          baseline: { avg_count: 100 },
          current: { current_count: 500 },
        })}
      />,
    );

    expect(screen.queryByTestId("baseline-chart")).not.toBeInTheDocument();
  });

  it("renders timestamp footer", () => {
    render(<AnomalyCard alert={makeAlert()} />);

    expect(screen.getByText(/Detected at/)).toBeInTheDocument();
  });
});
