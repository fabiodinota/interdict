/**
 * Tests for dashboard/src/components/regulatory/FrameworkDetail.tsx
 *
 * Validates detail view rendering, loading state, active/inactive toggle,
 * policy table, and empty policies state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks
const mockActivateMutate = vi.fn();
const mockDeactivateMutate = vi.fn();
const mockTogglePolicyMutate = vi.fn();

vi.mock("@/hooks/use-regulatory", () => ({
  useFramework: vi.fn(),
  useActivateFramework: () => ({ mutate: mockActivateMutate, isPending: false }),
  useDeactivateFramework: () => ({ mutate: mockDeactivateMutate, isPending: false }),
  useToggleFrameworkPolicy: () => ({ mutate: mockTogglePolicyMutate, isPending: false }),
}));

import { useFramework } from "@/hooks/use-regulatory";
import { FrameworkDetail } from "@/components/regulatory/FrameworkDetail";

const mockedUseFramework = vi.mocked(useFramework);

const makeFramework = (overrides: Record<string, unknown> = {}) => ({
  name: "GDPR",
  description: "General Data Protection Regulation",
  jurisdiction: "EU",
  version: "2.0",
  isActive: true,
  policies: [
    {
      id: "fp-1",
      policyId: "pol-1",
      policyName: "Data Retention",
      requirementRef: "Art. 5(1)(e)",
      requirementDescription: "Storage limitation principle",
      compilationStatus: "compiled",
      isRequired: true,
    },
    {
      id: "fp-2",
      policyId: "pol-2",
      policyName: "Consent Tracking",
      requirementRef: "Art. 7",
      requirementDescription: "Conditions for consent",
      compilationStatus: "pending",
      isRequired: false,
    },
  ],
  ...overrides,
});

describe("FrameworkDetail", () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders framework detail with name, description, and badges", () => {
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework() },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.getByText("General Data Protection Regulation")).toBeInTheDocument();
    expect(screen.getByText("EU")).toBeInTheDocument();
    expect(screen.getByText("v2.0")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders policies table with policy details", () => {
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework() },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    expect(screen.getByText("Policies (2)")).toBeInTheDocument();
    expect(screen.getByText("Data Retention")).toBeInTheDocument();
    expect(screen.getByText("Art. 5(1)(e)")).toBeInTheDocument();
    expect(screen.getByText("compiled")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework() },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    await user.click(screen.getByText("Back to Frameworks"));

    expect(mockOnBack).toHaveBeenCalled();
  });

  it("calls deactivate when toggling active framework off", async () => {
    const user = userEvent.setup();
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework({ isActive: true }) },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    // Find the framework active/inactive toggle (first switch)
    const switches = screen.getAllByRole("switch");
    await user.click(switches[0]);

    expect(mockDeactivateMutate).toHaveBeenCalledWith("gdpr");
  });

  it("calls activate when toggling inactive framework on", async () => {
    const user = userEvent.setup();
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework({ isActive: false }) },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    const switches = screen.getAllByRole("switch");
    await user.click(switches[0]);

    expect(mockActivateMutate).toHaveBeenCalledWith("gdpr");
  });

  it("calls togglePolicy when policy required switch is toggled", async () => {
    const user = userEvent.setup();
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework() },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    // Policy required switches are in the table — there's the framework switch + 2 policy switches
    const switches = screen.getAllByRole("switch");
    // Click the second policy switch (Consent Tracking, isRequired: false)
    await user.click(switches[2]);

    expect(mockTogglePolicyMutate).toHaveBeenCalledWith({
      slug: "gdpr",
      policyId: "pol-2",
      isRequired: true,
    });
  });

  it("renders empty policies message when no policies", () => {
    mockedUseFramework.mockReturnValue({
      data: { data: makeFramework({ policies: [] }) },
      isLoading: false,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    expect(screen.getByText("No policies configured for this framework.")).toBeInTheDocument();
  });

  it("renders loading skeletons when loading", () => {
    mockedUseFramework.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useFramework>);

    render(<FrameworkDetail slug="gdpr" onBack={mockOnBack} />);

    // Should not show framework name
    expect(screen.queryByText("GDPR")).not.toBeInTheDocument();
  });
});
