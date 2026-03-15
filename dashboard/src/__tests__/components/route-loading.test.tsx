/**
 * Tests for dashboard/src/components/layout/RouteLoading.tsx
 *
 * Validates skeleton layout rendering and accessibility attributes
 * for the route-level loading state.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { RouteLoading } from "@/components/layout/RouteLoading";

describe("RouteLoading", () => {
  it("renders skeleton placeholders with aria-busy", () => {
    const { container } = render(<RouteLoading />);

    // Should set aria-busy for screen readers
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute("aria-busy", "true");
    expect(wrapper).toHaveAttribute("aria-live", "polite");

    // Should render multiple skeleton elements (header + 4 cards + 2 panels)
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a grid layout with card-shaped skeletons", () => {
    const { container } = render(<RouteLoading />);

    // Should have the grid container for KPI card skeletons
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();

    // Grid should have responsive column classes
    expect(grid).toHaveClass("md:grid-cols-2");
  });

  it("has no axe-core accessibility violations", async () => {
    const { container } = render(<RouteLoading />);

    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
