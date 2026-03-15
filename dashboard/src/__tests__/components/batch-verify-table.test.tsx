/**
 * Tests for dashboard/src/components/evidence/BatchVerifyTable.tsx
 *
 * Batch verification table with TanStack Table, row selection, bulk verify, empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchVerifyTable } from "@/components/evidence/BatchVerifyTable";
import type { EvidenceBundle } from "@/types/api";
import type { EvidenceBundlesResponse } from "@/hooks/use-evidence";

// Mock the verify hook
const mockMutateAsync = vi.fn().mockResolvedValue({ data: [] });
vi.mock("@/hooks/use-evidence", async () => {
  const actual = await vi.importActual("@/hooks/use-evidence");
  return {
    ...actual,
    useVerifyBundles: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});

// Mock BundleDetailPanel to avoid complex Sheet rendering
vi.mock("@/components/evidence/BundleDetailPanel", () => ({
  BundleDetailPanel: ({ open }: any) =>
    open ? <div data-testid="bundle-detail-panel">Detail Panel</div> : null,
}));

// Mock Tooltip (radix portals)
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild }: any) => (asChild ? children : <div>{children}</div>),
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

function makeBundles(count: number): EvidenceBundle[] {
  return Array.from({ length: count }, (_, i) => ({
    bundle_id: `bundle-${i + 1}`,
    chain_hash: `chain-hash-${i + 1}`,
    previous_hash: `prev-hash-${i}`,
    sequence_number: i + 1,
    signature: `sig-${i + 1}`,
    signing_key_id: `key-1`,
    timestamp: `2025-01-15T${String(10 + i).padStart(2, "0")}:00:00Z`,
    actor_identity: `user${i + 1}@example.com`,
    vendor: i % 2 === 0 ? "OpenAI" : "Anthropic",
    policy_action: i % 3 === 0 ? "block" : "allow",
  }));
}

function makeResponse(bundles: EvidenceBundle[]): EvidenceBundlesResponse {
  return {
    success: true,
    data: bundles,
    pagination: {
      nextCursor: bundles.length > 3 ? "cursor-2" : null,
      hasMore: bundles.length > 3,
    },
  };
}

describe("BatchVerifyTable", () => {
  const defaultProps = {
    data: undefined as EvidenceBundlesResponse | undefined,
    isLoading: false,
    cursors: [] as string[],
    onNextPage: vi.fn(),
    onPreviousPage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no bundles and not loading", () => {
    render(<BatchVerifyTable {...defaultProps} data={makeResponse([])} />);

    expect(screen.getByText("No evidence bundles found")).toBeInTheDocument();
    expect(
      screen.getByText(/No evidence bundles found for the selected date range/),
    ).toBeInTheDocument();
  });

  it("renders loading skeleton when isLoading with no data", () => {
    render(<BatchVerifyTable {...defaultProps} isLoading={true} />);

    // Skeleton rows should be present — the table renders Skeleton components
    // Just verify the table structure is there (header row)
    const table = document.querySelector("table");
    expect(table).toBeTruthy();
  });

  it("renders table with bundle data", () => {
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    // Column headers
    expect(screen.getByText("Bundle ID")).toBeInTheDocument();
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Actor")).toBeInTheDocument();
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Verification")).toBeInTheDocument();
  });

  it("renders bundle IDs as truncated links", () => {
    const bundles = makeBundles(2);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    // Bundle IDs are truncated to first 12 chars + "..."
    expect(screen.getByText("bundle-1...")).toBeInTheDocument();
    expect(screen.getByText("bundle-2...")).toBeInTheDocument();
  });

  it("renders Verify Selected button showing selection count", () => {
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    expect(screen.getByText("Verify Selected (0)")).toBeInTheDocument();
  });

  it("disables Verify Selected when no rows are selected", () => {
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    const btn = screen.getByText("Verify Selected (0)").closest("button");
    expect(btn).toBeDisabled();
  });

  it("updates selection count when a row checkbox is toggled", async () => {
    const user = userEvent.setup();
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    // Click the first row checkbox (index 1 because index 0 is the header checkbox)
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // first data row

    expect(screen.getByText("Verify Selected (1)")).toBeInTheDocument();
  });

  it("toggles all rows when header checkbox is clicked", async () => {
    const user = userEvent.setup();
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    // Click the header checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]); // header checkbox

    expect(screen.getByText("Verify Selected (3)")).toBeInTheDocument();
  });

  it("renders pagination controls", () => {
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} />);

    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText(/Page 1/)).toBeInTheDocument();
  });

  it("disables Previous on first page", () => {
    const bundles = makeBundles(3);
    render(<BatchVerifyTable {...defaultProps} data={makeResponse(bundles)} cursors={[]} />);

    const prevBtn = screen.getByText("Previous").closest("button");
    expect(prevBtn).toBeDisabled();
  });

  it("calls onPreviousPage when Previous is clicked on subsequent pages", async () => {
    const user = userEvent.setup();
    const onPreviousPage = vi.fn();
    const bundles = makeBundles(3);

    render(
      <BatchVerifyTable
        {...defaultProps}
        data={makeResponse(bundles)}
        cursors={["cursor-1"]}
        onPreviousPage={onPreviousPage}
      />,
    );

    await user.click(screen.getByText("Previous"));
    expect(onPreviousPage).toHaveBeenCalledTimes(1);
  });
});
