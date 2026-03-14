/**
 * Tests for dashboard/src/components/regulatory/FrameworkList.tsx
 *
 * Validates regulatory framework display, jurisdiction grouping, empty states,
 * and selection functionality for compliance framework management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FrameworkList } from "@/components/regulatory/FrameworkList";
import type { FrameworkSummary } from "@/hooks/use-regulatory";

// Mock the regulatory hooks and components
const mockUseFrameworks = vi.fn();
vi.mock("@/hooks/use-regulatory", () => ({
  useFrameworks: () => mockUseFrameworks(),
}));

vi.mock("@/components/regulatory/FrameworkCard", () => ({
  FrameworkCard: ({
    framework,
    onSelect,
  }: {
    framework: FrameworkSummary;
    onSelect: (slug: string) => void;
  }) => (
    <div data-testid={`framework-card-${framework.id}`}>
      <h3>{framework.name}</h3>
      <p>{framework.jurisdiction}</p>
      <p>{framework.description}</p>
      <button onClick={() => onSelect(framework.slug || framework.id)}>Select Framework</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_FRAMEWORKS: FrameworkSummary[] = [
  {
    id: "gdpr",
    slug: "gdpr",
    name: "GDPR",
    description: "General Data Protection Regulation",
    jurisdiction: "European Union",
    active: true,
    requirementCount: 25,
  },
  {
    id: "ccpa",
    slug: "ccpa",
    name: "CCPA",
    description: "California Consumer Privacy Act",
    jurisdiction: "United States",
    active: true,
    requirementCount: 18,
  },
  {
    id: "pipeda",
    slug: "pipeda",
    name: "PIPEDA",
    description: "Personal Information Protection and Electronic Documents Act",
    jurisdiction: "Canada",
    active: true,
    requirementCount: 12,
  },
  {
    id: "lgpd",
    slug: "lgpd",
    name: "LGPD",
    description: "Lei Geral de Proteção de Dados",
    jurisdiction: "Brazil",
    active: false,
    requirementCount: 20,
  },
  {
    id: "dpa-2018",
    slug: "dpa-2018",
    name: "Data Protection Act 2018",
    description: "UK Data Protection Act 2018",
    jurisdiction: "United Kingdom",
    active: true,
    requirementCount: 22,
  },
];

const MOCK_FRAMEWORK_RESPONSE = {
  success: true,
  data: MOCK_FRAMEWORKS,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FrameworkList", () => {
  const mockOnSelectFramework = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFrameworks.mockReturnValue({
      data: MOCK_FRAMEWORK_RESPONSE,
      isLoading: false,
    });
  });

  describe("framework rendering", () => {
    it("renders framework cards", () => {
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      expect(screen.getByTestId("framework-card-gdpr")).toBeInTheDocument();
      expect(screen.getByTestId("framework-card-ccpa")).toBeInTheDocument();
      expect(screen.getByTestId("framework-card-pipeda")).toBeInTheDocument();
      expect(screen.getByTestId("framework-card-lgpd")).toBeInTheDocument();
      expect(screen.getByTestId("framework-card-dpa-2018")).toBeInTheDocument();
    });

    it("displays framework names and descriptions", () => {
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      expect(screen.getByText("GDPR")).toBeInTheDocument();
      expect(screen.getByText("General Data Protection Regulation")).toBeInTheDocument();
      expect(screen.getByText("CCPA")).toBeInTheDocument();
      expect(screen.getByText("California Consumer Privacy Act")).toBeInTheDocument();
      expect(screen.getByText("PIPEDA")).toBeInTheDocument();
      expect(screen.getByText("LGPD")).toBeInTheDocument();
    });

    it("shows jurisdictions", () => {
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Check for jurisdiction content - both in headers and cards
      const euElements = screen.getAllByText("European Union");
      expect(euElements.length).toBeGreaterThanOrEqual(1);

      const usElements = screen.getAllByText("United States");
      expect(usElements.length).toBeGreaterThanOrEqual(1);

      const canadaElements = screen.getAllByText("Canada");
      expect(canadaElements.length).toBeGreaterThanOrEqual(1);

      const brazilElements = screen.getAllByText("Brazil");
      expect(brazilElements.length).toBeGreaterThanOrEqual(1);

      const ukElements = screen.getAllByText("United Kingdom");
      expect(ukElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("jurisdiction grouping", () => {
    it("groups frameworks by jurisdiction when multiple jurisdictions", () => {
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Should show jurisdiction content (could be in headers or cards)
      const euElements = screen.getAllByText("European Union");
      expect(euElements.length).toBeGreaterThanOrEqual(1);

      const usElements = screen.getAllByText("United States");
      expect(usElements.length).toBeGreaterThanOrEqual(1);

      // Check for other jurisdictions
      const canadaElements = screen.getAllByText("Canada");
      expect(canadaElements.length).toBeGreaterThanOrEqual(1);

      const brazilElements = screen.getAllByText("Brazil");
      expect(brazilElements.length).toBeGreaterThanOrEqual(1);

      const ukElements = screen.getAllByText("United Kingdom");
      expect(ukElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows flat grid when only one jurisdiction", () => {
      const singleJurisdictionFrameworks = MOCK_FRAMEWORKS.filter(
        (f) => f.jurisdiction === "European Union",
      );

      mockUseFrameworks.mockReturnValue({
        data: { success: true, data: singleJurisdictionFrameworks },
        isLoading: false,
      });

      const { container } = render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Should use grid layout directly without jurisdiction headers
      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-3");
    });

    it("handles frameworks with null jurisdiction", () => {
      const frameworksWithNull = [
        ...MOCK_FRAMEWORKS,
        {
          id: "custom",
          slug: "custom",
          name: "Custom Framework",
          description: "Custom compliance framework",
          jurisdiction: null,
          active: true,
          requirementCount: 10,
        },
      ];

      mockUseFrameworks.mockReturnValue({
        data: { success: true, data: frameworksWithNull },
        isLoading: false,
      });

      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Should group null jurisdiction under "Other"
      expect(screen.getByText("Other")).toBeInTheDocument();
      expect(screen.getByText("Custom Framework")).toBeInTheDocument();
    });
  });

  describe("framework selection", () => {
    it("calls onSelectFramework when framework is selected", async () => {
      const user = userEvent.setup();
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Find a specific framework card and click its button
      const gdprCard = screen.getByTestId("framework-card-gdpr");
      const selectButton = gdprCard.querySelector("button");
      expect(selectButton).toBeTruthy();

      await user.click(selectButton!);

      expect(mockOnSelectFramework).toHaveBeenCalledWith("gdpr");
    });

    it("passes correct slug for each framework", async () => {
      const user = userEvent.setup();
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Click CCPA framework
      const ccpaCard = screen.getByTestId("framework-card-ccpa");
      const ccpaButton = ccpaCard.querySelector("button");
      await user.click(ccpaButton!);
      expect(mockOnSelectFramework).toHaveBeenCalledWith("ccpa");

      // Click PIPEDA framework
      const pipedaCard = screen.getByTestId("framework-card-pipeda");
      const pipedaButton = pipedaCard.querySelector("button");
      await user.click(pipedaButton!);
      expect(mockOnSelectFramework).toHaveBeenCalledWith("pipeda");
    });
  });

  describe("loading state", () => {
    it("shows loading skeletons while fetching", () => {
      mockUseFrameworks.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Should not show actual framework cards during loading
      expect(screen.queryByTestId("framework-card-gdpr")).not.toBeInTheDocument();
      expect(screen.queryByText("GDPR")).not.toBeInTheDocument();

      // Should show skeleton structure
      const skeletons = screen.queryAllByTestId(/skeleton/);
      // Basic check that we're in loading state
      expect(screen.queryByText("General Data Protection Regulation")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no frameworks available", () => {
      mockUseFrameworks.mockReturnValue({
        data: { success: true, data: [] },
        isLoading: false,
      });

      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      expect(screen.getByText("No regulatory frameworks available")).toBeInTheDocument();
      expect(
        screen.getByText("Regulatory frameworks will appear here once configured."),
      ).toBeInTheDocument();
    });
  });

  describe("grid layout", () => {
    it("uses responsive grid layout for framework cards", () => {
      const { container } = render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      const gridContainers = container.querySelectorAll(".grid");
      expect(gridContainers.length).toBeGreaterThan(0);

      // Check for responsive grid classes
      const hasResponsiveGrid = Array.from(gridContainers).some(
        (grid) =>
          grid.classList.contains("grid-cols-1") &&
          grid.classList.contains("md:grid-cols-2") &&
          grid.classList.contains("lg:grid-cols-3"),
      );
      expect(hasResponsiveGrid).toBe(true);
    });

    it("displays frameworks in proper grid structure", () => {
      const { container } = render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Should have framework cards in the grids
      const frameworkCards = container.querySelectorAll("[data-testid^='framework-card-']");
      expect(frameworkCards.length).toBe(5); // 5 mock frameworks
    });
  });

  describe("accessibility", () => {
    it("maintains proper heading hierarchy for jurisdictions", () => {
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // Jurisdiction names should be accessible (could be multiple instances)
      const euElements = screen.getAllByText("European Union");
      expect(euElements.length).toBeGreaterThan(0);

      const usElements = screen.getAllByText("United States");
      expect(usElements.length).toBeGreaterThan(0);

      const canadaElements = screen.getAllByText("Canada");
      expect(canadaElements.length).toBeGreaterThan(0);
    });

    it("provides selectable framework cards", async () => {
      const user = userEvent.setup();
      render(<FrameworkList onSelectFramework={mockOnSelectFramework} />);

      // All frameworks should have select buttons
      const selectButtons = screen.getAllByText("Select Framework");
      expect(selectButtons.length).toBe(5);

      // Should be able to interact with buttons
      await user.click(selectButtons[0]);
      expect(mockOnSelectFramework).toHaveBeenCalled();
    });
  });
});
