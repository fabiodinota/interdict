/**
 * Simplified tests for dashboard/src/components/reviews/ReviewQueue.tsx
 *
 * Basic functionality tests to ensure the component renders without breaking
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewQueue } from "@/components/reviews/ReviewQueue";

// Mock the review hooks with minimal return values
const MOCK_STATS = { pending: 5, claimed: 2, resolvedToday: 10, expired: 1 };

vi.mock("@/hooks/use-reviews", () => ({
  useReviewQueue: () => ({
    data: {
      data: [],
      stats: MOCK_STATS,
      pagination: { nextCursor: null },
    },
    isLoading: false,
  }),
  useClaimReview: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

// Mock child components to avoid complex dependencies
vi.mock("@/components/reviews/SlaTimer", () => ({
  SlaTimer: () => <span>SLA Timer</span>,
}));

vi.mock("@/components/reviews/ReviewDialog", () => ({
  ReviewDialog: () => <div data-testid="review-dialog">Dialog</div>,
}));

describe("ReviewQueue (simplified)", () => {
  it("renders without crashing", () => {
    render(<ReviewQueue />);

    // Should render basic structure
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("shows empty state message", () => {
    render(<ReviewQueue />);

    expect(screen.getByText("No review items found.")).toBeInTheDocument();
  });

  it("shows pagination controls", () => {
    render(<ReviewQueue />);

    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("calls onStatsUpdate via effect, not synchronously during render", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onStatsUpdate = vi.fn();

    render(<ReviewQueue onStatsUpdate={onStatsUpdate} />);

    // onStatsUpdate should be called with the mock stats via useEffect
    await waitFor(() => {
      expect(onStatsUpdate).toHaveBeenCalledWith(MOCK_STATS);
    });

    // Should be called exactly once (not doubled by strict-mode render-phase re-runs)
    expect(onStatsUpdate).toHaveBeenCalledTimes(1);

    // No React warnings about state updates during render
    const renderPhaseWarnings = consoleErrorSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        (args[0].includes("Cannot update a component") ||
          args[0].includes("state update during render")),
    );
    expect(renderPhaseWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});
