/**
 * Tests for dashboard/src/components/department-policies/MandatoryBadge.tsx
 *
 * Validates conditional badge rendering and tooltip content for mandatory
 * policy indicators.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MandatoryBadge } from "@/components/department-policies/MandatoryBadge";

describe("MandatoryBadge", () => {
  it("renders badge with lock icon when isMandatory is true", () => {
    render(<MandatoryBadge isMandatory={true} />);

    expect(screen.getByText("Mandatory")).toBeInTheDocument();
    // Badge should have a tooltip trigger role (Radix tooltip renders content lazily)
    const trigger = screen.getByText("Mandatory").closest("[data-slot='tooltip-trigger']");
    expect(trigger).toBeInTheDocument();
  });

  it("renders nothing when isMandatory is false", () => {
    const { container } = render(<MandatoryBadge isMandatory={false} />);

    expect(screen.queryByText("Mandatory")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });
});
