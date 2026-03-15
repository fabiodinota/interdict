/**
 * Tests for dashboard/src/components/policies/PolicyVersionHistory.tsx
 *
 * Validates version list rendering, expand/collapse, diff display, restore
 * confirmation dialog, loading state, and empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks
const mockMutate = vi.fn();
vi.mock("@/hooks/use-policies", () => ({
  usePolicyVersions: vi.fn(),
  useRestoreVersion: () => ({ mutate: mockMutate, isPending: false }),
}));

// Must import after mock
import { usePolicyVersions } from "@/hooks/use-policies";
import { PolicyVersionHistory } from "@/components/policies/PolicyVersionHistory";

const mockedUsePolicyVersions = vi.mocked(usePolicyVersions);

const makeVersion = (id: string, version: number, rego: string, desc?: string) => ({
  id,
  version,
  rego_source: rego,
  change_description: desc ?? null,
  created_at: "2025-06-01T12:00:00Z",
});

describe("PolicyVersionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders version list with Current badge on latest version", () => {
    mockedUsePolicyVersions.mockReturnValue({
      data: {
        data: [
          makeVersion("v1", 1, "package p1"),
          makeVersion("v2", 2, "package p2", "Updated rules"),
        ],
      },
      isLoading: false,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="package p2" />,
    );

    expect(screen.getByText("Version History")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("- Updated rules")).toBeInTheDocument();
  });

  it("expands a version to show rego source on click", async () => {
    const user = userEvent.setup();
    mockedUsePolicyVersions.mockReturnValue({
      data: {
        data: [makeVersion("v1", 1, "package policy_one")],
      },
      isLoading: false,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="package current" />,
    );

    // Click to expand
    await user.click(screen.getByText("v1"));

    // Rego source should be visible
    expect(screen.getByText("package policy_one")).toBeInTheDocument();
  });

  it("shows restore confirmation dialog and calls mutate on confirm", async () => {
    const user = userEvent.setup();
    mockedUsePolicyVersions.mockReturnValue({
      data: {
        data: [
          makeVersion("v1", 1, "package old"),
          makeVersion("v2", 2, "package new"),
        ],
      },
      isLoading: false,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="package new" />,
    );

    // Expand the non-current version (v1)
    await user.click(screen.getByText("v1"));

    // Click Restore button
    await user.click(screen.getByText("Restore"));

    // Dialog should show
    expect(screen.getByText("Restore Version")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to restore version 1/),
    ).toBeInTheDocument();

    // Confirm restore
    await user.click(screen.getByRole("button", { name: /^Restore$/ }));

    expect(mockMutate).toHaveBeenCalledWith({
      policyId: "pol-1",
      versionId: "v1",
    });
  });

  it("cancels restore dialog without calling mutate", async () => {
    const user = userEvent.setup();
    mockedUsePolicyVersions.mockReturnValue({
      data: {
        data: [
          makeVersion("v1", 1, "package old"),
          makeVersion("v2", 2, "package new"),
        ],
      },
      isLoading: false,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="package new" />,
    );

    await user.click(screen.getByText("v1"));
    await user.click(screen.getByText("Restore"));

    // Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("renders empty state when no versions exist", () => {
    mockedUsePolicyVersions.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="" />,
    );

    expect(
      screen.getByText("No version history available."),
    ).toBeInTheDocument();
  });

  it("renders loading skeletons when data is loading", () => {
    mockedUsePolicyVersions.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof usePolicyVersions>);

    render(
      <PolicyVersionHistory policyId="pol-1" currentRegoSource="" />,
    );

    // Should not show version history heading or empty state
    expect(screen.queryByText("Version History")).not.toBeInTheDocument();
    expect(screen.queryByText("No version history available.")).not.toBeInTheDocument();
  });
});
