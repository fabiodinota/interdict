/**
 * Tests for dashboard/src/components/regulatory/FrameworkCard.tsx
 *
 * Validates card display with various framework props, active/inactive
 * badge states, and toggle interaction.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FrameworkCard } from "@/components/regulatory/FrameworkCard";
import type { FrameworkSummary } from "@/hooks/use-regulatory";

// Mock the regulatory hooks
const mockActivateMutate = vi.fn();
const mockDeactivateMutate = vi.fn();

vi.mock("@/hooks/use-regulatory", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/use-regulatory");
  return {
    ...actual,
    useActivateFramework: () => ({
      mutate: mockActivateMutate,
      isPending: false,
    }),
    useDeactivateFramework: () => ({
      mutate: mockDeactivateMutate,
      isPending: false,
    }),
  };
});

const makeFramework = (overrides: Partial<FrameworkSummary> = {}): FrameworkSummary => ({
  id: "fw-1",
  slug: "gdpr",
  name: "GDPR",
  description: "General Data Protection Regulation",
  jurisdiction: "EU",
  version: "2.1",
  isSeeded: true,
  isActive: true,
  policyCount: 10,
  activePolicyCount: 7,
  ...overrides,
});

describe("FrameworkCard", () => {
  it("renders framework details and active badge", () => {
    const onSelect = vi.fn();

    render(<FrameworkCard framework={makeFramework()} onSelect={onSelect} />);

    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.getByText("General Data Protection Regulation")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("EU")).toBeInTheDocument();
    expect(screen.getByText("v2.1")).toBeInTheDocument();
    expect(screen.getByText("7/10 policies active")).toBeInTheDocument();
  });

  it("renders inactive badge when framework is not active", () => {
    const onSelect = vi.fn();

    render(
      <FrameworkCard
        framework={makeFramework({ isActive: false })}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("calls deactivate when active framework toggle is switched", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<FrameworkCard framework={makeFramework()} onSelect={onSelect} />);

    const toggle = screen.getByRole("switch");
    await user.click(toggle);

    expect(mockDeactivateMutate).toHaveBeenCalledWith("gdpr");
  });

  it("omits description and jurisdiction when null", () => {
    const onSelect = vi.fn();

    render(
      <FrameworkCard
        framework={makeFramework({ description: null, jurisdiction: null, version: null })}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.queryByText("EU")).not.toBeInTheDocument();
  });
});
