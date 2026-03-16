/**
 * Tests for dashboard/src/app/(dashboard)/anomalies/page.tsx
 *
 * Validates ARIA roles on severity filter tabs: tablist, tab, aria-selected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks before importing the page component
vi.mock("@/hooks/use-anomalies", () => ({
  useAnomalies: () => ({
    data: { data: [] },
    isLoading: false,
    dataUpdatedAt: Date.now(),
  }),
  useAnomalySummary: () => ({
    data: { data: { total: 0, critical: 0, warning: 0, info: 0 } },
    isLoading: false,
  }),
}));

// Mock AnomalyList to keep the test focused on the page-level tabs
vi.mock("@/components/anomalies/AnomalyList", () => ({
  AnomalyList: () => <div data-testid="anomaly-list" />,
}));

import AnomaliesPage from "@/app/(dashboard)/anomalies/page";

describe("AnomaliesPage — severity tabs ARIA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a tablist container", () => {
    render(<AnomaliesPage />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("renders tab elements matching SEVERITY_TABS count", () => {
    render(<AnomaliesPage />);

    const tabs = screen.getAllByRole("tab");
    // SEVERITY_TABS has 4 entries: All, Critical, Warning, Info
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent("All");
    expect(tabs[1]).toHaveTextContent("Critical");
    expect(tabs[2]).toHaveTextContent("Warning");
    expect(tabs[3]).toHaveTextContent("Info");
  });

  it("marks 'All' tab as selected on initial render and others as not selected", () => {
    render(<AnomaliesPage />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true"); // All — default
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
    expect(tabs[3]).toHaveAttribute("aria-selected", "false");
  });

  it("updates aria-selected when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(<AnomaliesPage />);

    const tabs = screen.getAllByRole("tab");

    await user.click(tabs[1]); // Click "Critical"

    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
    expect(tabs[3]).toHaveAttribute("aria-selected", "false");
  });
});
