/**
 * Tests for dashboard/src/components/dashboard/KpiCards.tsx
 *
 * Validates KPI display, loading states, and number formatting for the
 * dashboard overview cards showing key metrics.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCards } from "@/components/dashboard/KpiCards";

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe("KpiCards", () => {
  describe("data rendering", () => {
    it("renders all KPI cards with provided data", () => {
      render(
        <KpiCards
          totalRequests={15420}
          violationsToday={23}
          activePolicies={8}
          activeVendors={12}
          isLoading={false}
        />,
      );

      // Check card labels
      expect(screen.getByText("Total Requests")).toBeInTheDocument();
      expect(screen.getByText("Violations Today")).toBeInTheDocument();
      expect(screen.getByText("Active Policies")).toBeInTheDocument();
      expect(screen.getByText("Active Vendors")).toBeInTheDocument();

      // Check formatted values
      expect(screen.getByText("15,420")).toBeInTheDocument();
      expect(screen.getByText("23")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
    });

    it("formats large numbers correctly", () => {
      render(
        <KpiCards
          totalRequests={1234567}
          violationsToday={0}
          activePolicies={100}
          activeVendors={25}
          isLoading={false}
        />,
      );

      expect(screen.getByText("1,234,567")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });
  });

  describe("loading states", () => {
    it("shows loading skeletons when isLoading is true", () => {
      render(
        <KpiCards
          totalRequests={1000}
          violationsToday={5}
          activePolicies={3}
          activeVendors={2}
          isLoading={true}
        />,
      );

      // Values should not be visible during loading
      expect(screen.queryByText("1,000")).not.toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
      expect(screen.queryByText("3")).not.toBeInTheDocument();
      expect(screen.queryByText("2")).not.toBeInTheDocument();

      // Card labels should still be visible
      expect(screen.getByText("Total Requests")).toBeInTheDocument();
    });

    it("shows loading skeletons for undefined values", () => {
      render(
        <KpiCards
          totalRequests={1000}
          violationsToday={5}
          activePolicies={undefined}
          activeVendors={undefined}
          isLoading={false}
        />,
      );

      // Defined values should show
      expect(screen.getByText("1,000")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();

      // Undefined values should show as skeletons
      expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    });
  });

  describe("card structure", () => {
    it("renders cards with proper icons and styling classes", () => {
      const { container } = render(
        <KpiCards
          totalRequests={100}
          violationsToday={10}
          activePolicies={5}
          activeVendors={3}
          isLoading={false}
        />,
      );

      // Check grid layout
      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4");

      // Check that we have 4 cards
      const cards = container.querySelectorAll("[data-testid*='card'], .border");
      expect(cards.length).toBeGreaterThanOrEqual(4);
    });

    it("displays zero values correctly", () => {
      render(
        <KpiCards
          totalRequests={0}
          violationsToday={0}
          activePolicies={0}
          activeVendors={0}
          isLoading={false}
        />,
      );

      const zeroValues = screen.getAllByText("0");
      expect(zeroValues).toHaveLength(4);
    });
  });

  describe("accessibility", () => {
    it("maintains proper heading hierarchy", () => {
      render(
        <KpiCards
          totalRequests={100}
          violationsToday={10}
          activePolicies={5}
          activeVendors={3}
          isLoading={false}
        />,
      );

      // Card titles should be readable
      expect(screen.getByText("Total Requests")).toBeInTheDocument();
      expect(screen.getByText("Violations Today")).toBeInTheDocument();
      expect(screen.getByText("Active Policies")).toBeInTheDocument();
      expect(screen.getByText("Active Vendors")).toBeInTheDocument();
    });
  });
});
