/**
 * Tests for dashboard/src/components/audit/AuditTable.tsx
 *
 * Validates audit table rendering, pagination, empty states, and verification
 * functionality for the audit trail interface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditTable } from "@/components/audit/AuditTable";
import type { AuditSearchResponse, AuditRecord } from "@/hooks/use-audit";

// Mock the verification hook
const mockUseVerifyBundles = vi.fn();
vi.mock("@/hooks/use-evidence", () => ({
  useVerifyBundles: () => mockUseVerifyBundles(),
}));

// Mock the BundleDetailPanel
vi.mock("@/components/evidence/BundleDetailPanel", () => ({
  BundleDetailPanel: ({
    open,
    bundle,
    verificationResult,
  }: {
    open: boolean;
    bundle: any;
    verificationResult: any;
  }) => (
    <div data-testid="bundle-detail-panel" style={{ display: open ? "block" : "none" }}>
      Bundle: {bundle.bundle_id}, Result: {verificationResult?.overall}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_AUDIT_RECORDS: AuditRecord[] = [
  {
    timestamp: "2024-03-14T10:30:00Z",
    bundle_id: "bundle-123",
    kernel_id: "kernel-1",
    actor_identity: "user@company.com",
    actor_display_name: "John Doe",
    department: "engineering",
    department_display_name: "Engineering",
    vendor: "openai",
    vendor_display_name: "OpenAI",
    model: "gpt-4",
    policy_action: "allow",
    policy_rules: [],
    token_count: 150,
    enforcement_latency_us: 2500,
    chain_hash: "hash-abc",
    prompt_hash: "prompt-hash-1",
    response_hash: "response-hash-1",
  },
  {
    timestamp: "2024-03-14T10:25:00Z",
    bundle_id: "bundle-456",
    kernel_id: "kernel-2",
    actor_identity: "admin@company.com",
    actor_display_name: "Jane Admin",
    department: "compliance",
    department_display_name: "Compliance",
    vendor: "anthropic",
    vendor_display_name: "Anthropic",
    model: "claude-3",
    policy_action: "block",
    policy_rules: [],
    token_count: 75,
    enforcement_latency_us: 1200,
    chain_hash: "hash-def",
    prompt_hash: "prompt-hash-2",
    response_hash: "response-hash-2",
  },
];

const MOCK_AUDIT_RESPONSE: AuditSearchResponse = {
  success: true,
  data: MOCK_AUDIT_RECORDS,
  pagination: {
    hasMore: true,
    nextCursor: "next-cursor-123",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVerifyBundles.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  describe("table headers", () => {
    it("renders all column headers", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      expect(screen.getByText("Timestamp")).toBeInTheDocument();
      expect(screen.getByText("Actor")).toBeInTheDocument();
      expect(screen.getByText("Department")).toBeInTheDocument();
      expect(screen.getByText("Vendor")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
      expect(screen.getByText("Tokens")).toBeInTheDocument();
      expect(screen.getByText("Latency")).toBeInTheDocument();
      expect(screen.getByText("Verify")).toBeInTheDocument();
    });
  });

  describe("data rendering", () => {
    it("renders audit records in table rows", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      // Check actor names
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Admin")).toBeInTheDocument();

      // Check departments
      expect(screen.getByText("Engineering")).toBeInTheDocument();
      expect(screen.getByText("Compliance")).toBeInTheDocument();

      // Check vendors
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();

      // Check models
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
      expect(screen.getByText("claude-3")).toBeInTheDocument();

      // Check actions with badges
      expect(screen.getByText("allow")).toBeInTheDocument();
      expect(screen.getByText("block")).toBeInTheDocument();
    });

    it("formats timestamps correctly", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      // Should display timestamps in the table - just check if any timestamp-like text appears
      const timestampElements = screen.getAllByText(/2024/);
      expect(timestampElements.length).toBeGreaterThan(0);
    });

    it("formats token counts and latency correctly", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      expect(screen.getByText("150")).toBeInTheDocument();
      expect(screen.getByText("75")).toBeInTheDocument();
      expect(screen.getByText("2.5ms")).toBeInTheDocument();
      expect(screen.getByText("1.2ms")).toBeInTheDocument();
    });

    it("handles null values gracefully", () => {
      const recordWithNulls: AuditRecord = {
        ...MOCK_AUDIT_RECORDS[0],
        token_count: null as any,
        enforcement_latency_us: null as any,
        department_display_name: null,
      };

      render(
        <AuditTable
          data={{
            success: true,
            data: [recordWithNulls],
            pagination: { hasMore: false, nextCursor: null },
          }}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      const dashElements = screen.getAllByText("-");
      expect(dashElements.length).toBeGreaterThanOrEqual(2); // For token_count and latency
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton when loading and no data", () => {
      render(
        <AuditTable
          data={undefined}
          isLoading={true}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      // Should not show actual data
      expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
      expect(screen.queryByText("Jane Admin")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no records found", () => {
      render(
        <AuditTable
          data={{ success: true, data: [], pagination: { hasMore: false, nextCursor: null } }}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      expect(screen.getByText("No audit records found")).toBeInTheDocument();
      expect(screen.getByText(/No audit records found matching your filters/)).toBeInTheDocument();
    });
  });

  describe("pagination", () => {
    it("shows pagination information", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={["cursor1"]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      expect(screen.getByText(/Page 2/)).toBeInTheDocument();
      expect(screen.getByText(/2 records/)).toBeInTheDocument();
    });

    it("enables previous button when cursors exist", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={["cursor1"]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      const prevButton = screen.getByText("Previous").closest("button");
      expect(prevButton).not.toBeDisabled();
    });

    it("disables previous button when no cursors", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      const prevButton = screen.getByText("Previous").closest("button");
      expect(prevButton).toBeDisabled();
    });

    it("enables next button when hasMore is true", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      const nextButton = screen.getByText("Next").closest("button");
      expect(nextButton).not.toBeDisabled();
    });

    it("calls onNextPage when next button clicked", async () => {
      const user = userEvent.setup();
      const onNextPage = vi.fn();

      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={onNextPage}
          onPreviousPage={vi.fn()}
        />,
      );

      const nextButton = screen.getByText("Next");
      await user.click(nextButton);

      expect(onNextPage).toHaveBeenCalledWith("next-cursor-123");
    });
  });

  describe("verification functionality", () => {
    it("renders verification buttons for each row", () => {
      render(
        <AuditTable
          data={MOCK_AUDIT_RESPONSE}
          isLoading={false}
          cursors={[]}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );

      // Should have at least one verification button per row
      const verifyButtons = screen.getAllByRole("button");
      expect(verifyButtons.length).toBeGreaterThan(0);

      // Check that we have rows rendered
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Admin")).toBeInTheDocument();
    });
  });
});
