/**
 * Tests for dashboard/src/app/(dashboard)/page.tsx
 *
 * Verifies that lastUpdated is set via useEffect (not during render),
 * and that no render-phase state update warnings are emitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "@/app/(dashboard)/page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

const MOCK_DATA_UPDATED_AT = 1700000000000; // fixed timestamp

vi.mock("@/hooks/use-dashboard-stats", () => ({
  useHourlyViolations: () => ({
    data: [{ hour: "2024-01-01T00:00:00Z", policy_action: "block", violation_count: 5, unique_actors: 2, unique_vendors: 1 }],
    dataUpdatedAt: MOCK_DATA_UPDATED_AT,
    isLoading: false,
  }),
  useVendorUsage: () => ({
    data: [],
    isLoading: false,
  }),
  useActivePoliciesCount: () => ({
    data: 3,
    isLoading: false,
  }),
  useApprovedVendorsCount: () => ({
    data: 2,
    isLoading: false,
  }),
  useViolationKpis: () => ({
    totalRequests: 5,
    violationsToday: 5,
  }),
}));

// Stub child components — TimeRangeSelector exposes lastUpdated so we can assert on it
vi.mock("@/components/dashboard/TimeRangeSelector", () => ({
  TimeRangeSelector: ({ lastUpdated }: { lastUpdated: Date | null }) => (
    <div data-testid="time-range-selector">
      {lastUpdated ? `Updated: ${lastUpdated.toISOString()}` : "Not updated"}
    </div>
  ),
  getDateRange: () => ({ from: "2024-01-01T00:00:00Z", to: "2024-01-02T00:00:00Z" }),
}));

vi.mock("@/components/dashboard/KpiCards", () => ({
  KpiCards: () => <div data-testid="kpi-cards">KPI Cards</div>,
}));

vi.mock("@/components/dashboard/ViolationChart", () => ({
  ViolationChart: () => <div data-testid="violation-chart">Violation Chart</div>,
}));

vi.mock("@/components/dashboard/VendorUsageChart", () => ({
  VendorUsageChart: () => <div data-testid="vendor-usage-chart">Vendor Usage Chart</div>,
}));

vi.mock("@/components/dashboard/ActivityFeed", () => ({
  ActivityFeed: () => <div data-testid="activity-feed">Activity Feed</div>,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomePage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("sets lastUpdated via useEffect after data arrives", async () => {
    render(<HomePage />);

    // Initially lastUpdated is null — the mock renders "Not updated"
    // After the useEffect fires, it should update to the mock timestamp
    await waitFor(() => {
      const selector = screen.getByTestId("time-range-selector");
      const expected = new Date(MOCK_DATA_UPDATED_AT).toISOString();
      expect(selector.textContent).toContain(expected);
    });
  });

  it("does not emit console warnings about state updates during render", async () => {
    render(<HomePage />);

    // Let effects settle
    await waitFor(() => {
      expect(screen.getByTestId("time-range-selector").textContent).not.toBe("Not updated");
    });

    // React warns about render-phase state updates via console.error
    const renderPhaseWarnings = consoleErrorSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        (args[0].includes("Cannot update a component") ||
          args[0].includes("state update during render")),
    );
    expect(renderPhaseWarnings).toHaveLength(0);
  });
});
