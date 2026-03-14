/**
 * Simplified tests for dashboard/src/components/reviews/ReviewQueue.tsx
 *
 * Basic functionality tests to ensure the component renders without breaking
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewQueue } from "@/components/reviews/ReviewQueue";

// Mock the review hooks with minimal return values
vi.mock("@/hooks/use-reviews", () => ({
  useReviewQueue: () => ({
    data: {
      data: [],
      stats: { pending: 0, claimed: 0, resolvedToday: 0, expired: 0 },
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
});
