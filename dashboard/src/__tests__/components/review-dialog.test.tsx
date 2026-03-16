/**
 * Tests for dashboard/src/components/reviews/ReviewDialog.tsx
 *
 * Resolution form with category select, notes textarea, approve/reject, cancellation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewDialog } from "@/components/reviews/ReviewDialog";
import type { ReviewItem } from "@/types/api";

// Mock the review hook
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/use-reviews", () => ({
  useResolveReview: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock SlaTimer
vi.mock("@/components/reviews/SlaTimer", () => ({
  SlaTimer: ({ deadline }: { deadline: string }) => <span data-testid="sla-timer">{deadline}</span>,
}));

// Mock radix Dialog to render inline (no portals)
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

// Mock radix Select
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="resolution-select" data-value={value}>
      {children}
      {/* Expose a way to change value in tests */}
      <button data-testid="select-false-positive" onClick={() => onValueChange("false_positive")}>
        Select false_positive
      </button>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

function makeReviewItem(overrides?: Partial<ReviewItem>): ReviewItem {
  return {
    id: "review-1",
    bundleId: "bundle-abc-123",
    escalatedAt: "2025-01-15T10:00:00Z",
    slaDeadline: "2025-01-15T14:00:00Z",
    status: "pending",
    claimedBy: null,
    claimedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolution: null,
    resolutionNotes: null,
    actorIdentity: "user@example.com",
    vendor: "OpenAI",
    model: "gpt-4",
    policyAction: "block",
    policyRules: ["rule-1"],
    riskScore: 85,
    promptHash: "abc123def456",
    responseHash: "789ghi012jkl",
    ...overrides,
  };
}

describe("ReviewDialog", () => {
  const defaultProps = {
    item: makeReviewItem(),
    open: true,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when item is null", () => {
    render(<ReviewDialog item={null} open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Review Escalated Interaction")).not.toBeInTheDocument();
  });

  it("renders dialog with interaction details when open", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Review Escalated Interaction")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("renders cryptographic evidence hashes", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Cryptographic Evidence")).toBeInTheDocument();
    expect(screen.getByText("abc123def456")).toBeInTheDocument();
    expect(screen.getByText("789ghi012jkl")).toBeInTheDocument();
  });

  it("renders resolution form fields", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText(/Category/)).toBeInTheDocument();
    expect(screen.getByText(/Reasoning/)).toBeInTheDocument();
  });

  it("renders Approve, Reject, and Cancel buttons", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables Approve/Reject when form is invalid (no resolution or short notes)", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Approve")).toBeDisabled();
    expect(screen.getByText("Reject")).toBeDisabled();
  });

  it("shows character count warning when notes are too short", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...defaultProps} />);

    const textarea = screen.getByPlaceholderText("Provide detailed reasoning for your decision...");
    await user.type(textarea, "short");

    expect(screen.getByText(/more character\(s\) required/)).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ReviewDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders policy rules as badges", () => {
    render(<ReviewDialog {...defaultProps} />);

    expect(screen.getByText("Triggering Policy Rules")).toBeInTheDocument();
    expect(screen.getByText("rule-1")).toBeInTheDocument();
  });

  it("renders SLA timer with deadline", () => {
    render(<ReviewDialog {...defaultProps} />);

    const timer = screen.getByTestId("sla-timer");
    expect(timer).toHaveTextContent("2025-01-15T14:00:00Z");
  });
});
