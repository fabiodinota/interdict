/**
 * Tests for dashboard/src/components/anomalies/AnomalyList.tsx
 *
 * Validates alert list rendering and empty state for the anomaly list container.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnomalyList } from "@/components/anomalies/AnomalyList";
import type { AnomalyAlert } from "@/types/api";

// Mock AnomalyCard to isolate the list container logic
vi.mock("@/components/anomalies/AnomalyCard", () => ({
  AnomalyCard: ({ alert }: { alert: AnomalyAlert }) => (
    <div data-testid="anomaly-card">{alert.summary}</div>
  ),
}));

const makeAlert = (overrides: Partial<AnomalyAlert> = {}): AnomalyAlert => ({
  type: "volume_spike",
  severity: "warning",
  actorIdentity: "user@example.com",
  summary: "Volume spike detected",
  baseline: { requests: 100 },
  current: { requests: 500 },
  detectedAt: "2025-01-01T00:00:00Z",
  actions: [{ label: "View", href: "/audit" }],
  ...overrides,
});

describe("AnomalyList", () => {
  it("renders alert cards when alerts are provided", () => {
    const alerts = [
      makeAlert({ summary: "Alert one" }),
      makeAlert({ summary: "Alert two", type: "off_hours" }),
    ];

    render(<AnomalyList alerts={alerts} />);

    expect(screen.getByText("Alert one")).toBeInTheDocument();
    expect(screen.getByText("Alert two")).toBeInTheDocument();
    expect(screen.getAllByTestId("anomaly-card")).toHaveLength(2);
  });

  it("renders empty state when alerts array is empty", () => {
    render(<AnomalyList alerts={[]} />);

    expect(screen.getByText("No anomalies detected")).toBeInTheDocument();
    expect(
      screen.getByText(/monitoring for volume spikes/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("anomaly-card")).not.toBeInTheDocument();
  });
});
