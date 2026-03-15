/**
 * Tests for dashboard/src/components/policies/PolicyRow.tsx
 *
 * Validates row rendering, expand/collapse toggle, delete dialog,
 * active/inactive switch, and edit navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyRow } from "@/components/policies/PolicyRow";
import type { Policy } from "@/types/api";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock hooks
const mockMutate = vi.fn();
const mockDeleteMutate = vi.fn();
vi.mock("@/hooks/use-policies", () => ({
  useUpdatePolicy: () => ({ mutate: mockMutate, isPending: false }),
  useDeletePolicy: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

// Mock child components to isolate
vi.mock("@/components/policies/CompilationStatus", () => ({
  CompilationStatus: () => <span data-testid="compilation-status">compiled</span>,
}));
vi.mock("@/components/policies/PolicyVersionHistory", () => ({
  PolicyVersionHistory: () => <div data-testid="version-history">versions</div>,
}));

const mockPolicy: Policy = {
  id: "policy-1",
  name: "Block OpenAI",
  description: "Blocks all OpenAI requests",
  is_active: true,
  created_at: "2025-03-15T10:00:00Z",
  updated_at: "2025-03-15T12:00:00Z",
  current_version: null,
};

describe("PolicyRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders policy name, description, and status", () => {
    render(<PolicyRow policy={mockPolicy} />);

    expect(screen.getByText("Block OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Blocks all OpenAI requests")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByTestId("compilation-status")).toBeInTheDocument();
  });

  it("shows Inactive label when policy is not active", () => {
    const inactivePolicy = { ...mockPolicy, is_active: false };
    render(<PolicyRow policy={inactivePolicy} />);

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("toggles expand/collapse to show version history", async () => {
    const user = userEvent.setup();
    render(<PolicyRow policy={mockPolicy} />);

    // Initially collapsed — no version history visible
    expect(screen.queryByTestId("version-history")).not.toBeInTheDocument();

    // Click expand button
    const expandButton = screen.getByLabelText("Expand");
    await user.click(expandButton);

    // Version history should now be visible
    expect(screen.getByTestId("version-history")).toBeInTheDocument();
    expect(screen.getByLabelText("Collapse")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog and confirms deletion", async () => {
    const user = userEvent.setup();
    render(<PolicyRow policy={mockPolicy} />);

    // Click delete button
    const deleteButton = screen.getByLabelText("Delete policy");
    await user.click(deleteButton);

    // Dialog should appear
    expect(screen.getByText("Delete Policy")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // Click confirm
    await user.click(screen.getByText("Delete"));
    expect(mockDeleteMutate).toHaveBeenCalledWith("policy-1");
  });

  it("cancels delete dialog without deleting", async () => {
    const user = userEvent.setup();
    render(<PolicyRow policy={mockPolicy} />);

    const deleteButton = screen.getByLabelText("Delete policy");
    await user.click(deleteButton);

    // Click cancel
    await user.click(screen.getByText("Cancel"));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("navigates to edit page when edit button is clicked", async () => {
    const user = userEvent.setup();
    render(<PolicyRow policy={mockPolicy} />);

    const editButton = screen.getByLabelText("Edit policy");
    await user.click(editButton);

    expect(mockPush).toHaveBeenCalledWith("/policies/new?edit=policy-1");
  });

  it("renders without description gracefully", () => {
    const noDescPolicy = { ...mockPolicy, description: null };
    render(<PolicyRow policy={noDescPolicy} />);

    expect(screen.getByText("Block OpenAI")).toBeInTheDocument();
  });
});
