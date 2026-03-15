/**
 * Tests for dashboard/src/components/department-policies/PolicyOverrideTable.tsx
 *
 * Validates table rendering, toggle interactions, mandatory badge display,
 * compliance officer columns, and empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DepartmentEffectivePolicy, UserRole } from "@/types/api";

// Mock hooks
const mockSetOverride = vi.fn();
const mockRemoveOverride = vi.fn();
const mockSetMandatory = vi.fn();

vi.mock("@/hooks/use-department-policies", () => ({
  useSetOverride: () => ({ mutateAsync: mockSetOverride, isPending: false }),
  useRemoveOverride: () => ({ mutateAsync: mockRemoveOverride, isPending: false }),
  useSetMandatory: () => ({ mutateAsync: mockSetMandatory, isPending: false }),
}));

// Mock MandatoryBadge to simplify assertions
vi.mock("@/components/department-policies/MandatoryBadge", () => ({
  MandatoryBadge: ({ isMandatory }: { isMandatory: boolean }) => (
    <span data-testid="mandatory-badge">{isMandatory ? "Locked" : "Optional"}</span>
  ),
}));

import { PolicyOverrideTable } from "@/components/department-policies/PolicyOverrideTable";

const makePolicy = (
  overrides: Partial<DepartmentEffectivePolicy> = {},
): DepartmentEffectivePolicy => ({
  policyId: "pol-1",
  name: "Block PII",
  description: "Blocks personally identifiable information",
  globalEnabled: true,
  effectiveEnabled: true,
  isMandatory: false,
  source: "Global",
  overrideId: null,
  ...overrides,
});

describe("PolicyOverrideTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table with policy rows", () => {
    const policies = [
      makePolicy({ policyId: "pol-1", name: "Block PII" }),
      makePolicy({ policyId: "pol-2", name: "Redact Secrets", source: "Department override" }),
    ];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    expect(screen.getByText("Block PII")).toBeInTheDocument();
    expect(screen.getByText("Redact Secrets")).toBeInTheDocument();
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Department override")).toBeInTheDocument();
  });

  it("calls setOverride when toggle is clicked", async () => {
    const user = userEvent.setup();
    const policies = [
      makePolicy({ policyId: "pol-1", name: "Block PII", effectiveEnabled: true }),
    ];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Toggle Block PII" });
    await user.click(toggle);

    expect(mockSetOverride).toHaveBeenCalledWith({
      department_id: "dept-1",
      policy_id: "pol-1",
      enabled: false,
    });
  });

  it("disables toggle for mandatory policies", () => {
    const policies = [
      makePolicy({ policyId: "pol-1", name: "Mandatory Policy", isMandatory: true }),
    ];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Toggle Mandatory Policy" });
    expect(toggle).toBeDisabled();
  });

  it("shows mandatory badge for mandatory policies", () => {
    const policies = [makePolicy({ isMandatory: true })];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Set Mandatory column for compliance_officer role", () => {
    const policies = [makePolicy()];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="compliance_officer"
      />,
    );

    expect(screen.getByText("Set Mandatory")).toBeInTheDocument();
    // Should have mandatory toggle switch
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(2); // status + mandatory
  });

  it("hides Set Mandatory column for non-compliance roles", () => {
    const policies = [makePolicy()];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    expect(screen.queryByText("Set Mandatory")).not.toBeInTheDocument();
  });

  it("renders empty state when no policies", () => {
    render(
      <PolicyOverrideTable
        policies={[]}
        departmentId="dept-1"
        userRole="department_admin"
      />,
    );

    expect(
      screen.getByText(/No policies found/),
    ).toBeInTheDocument();
  });

  it("calls setMandatory when mandatory toggle is clicked by compliance_officer", async () => {
    const user = userEvent.setup();
    const policies = [
      makePolicy({ policyId: "pol-1", name: "Block PII", isMandatory: false }),
    ];

    render(
      <PolicyOverrideTable
        policies={policies}
        departmentId="dept-1"
        userRole="compliance_officer"
      />,
    );

    // Click the mandatory toggle (second switch, after the status toggle)
    const mandatoryToggle = screen.getByRole("switch", {
      name: "Set Block PII as mandatory",
    });
    await user.click(mandatoryToggle);

    expect(mockSetMandatory).toHaveBeenCalledWith({
      policyId: "pol-1",
      is_mandatory: true,
    });
  });
});
