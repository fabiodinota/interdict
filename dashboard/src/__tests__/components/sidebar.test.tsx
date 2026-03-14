/**
 * Tests for dashboard/src/components/layout/sidebar.tsx
 *
 * Validates navigation structure, active link highlighting, and toggle functionality
 * for the main dashboard sidebar component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/layout/Sidebar";

// Mock Next.js navigation
const mockPush = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock TooltipProvider context
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
    asChild ? children : <div>{children}</div>,
}));

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/");
  });

  describe("navigation links", () => {
    it("renders all navigation items", () => {
      render(<Sidebar />);

      // Check for all expected nav items
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Policies")).toBeInTheDocument();
      expect(screen.getByText("Audit Trail")).toBeInTheDocument();
      expect(screen.getByText("Vendors")).toBeInTheDocument();
      expect(screen.getByText("Regulatory")).toBeInTheDocument();
      expect(screen.getByText("Reports")).toBeInTheDocument();
      expect(screen.getByText("Evidence")).toBeInTheDocument();
      expect(screen.getByText("Reviews")).toBeInTheDocument();
      expect(screen.getByText("Dept Policies")).toBeInTheDocument();
      expect(screen.getByText("Anomalies")).toBeInTheDocument();
      expect(screen.getByText("Signing Keys")).toBeInTheDocument();
    });

    it("highlights active link for home route", () => {
      mockUsePathname.mockReturnValue("/");
      render(<Sidebar />);

      const homeLink = screen.getByText("Home").closest("a");
      expect(homeLink).toHaveClass("bg-muted");
    });

    it("highlights active link for sub-routes", () => {
      mockUsePathname.mockReturnValue("/policies/123");
      render(<Sidebar />);

      const policiesLink = screen.getByText("Policies").closest("a");
      expect(policiesLink).toHaveClass("bg-muted");
    });

    it("renders correct hrefs for all nav items", () => {
      render(<Sidebar />);

      const homeLink = screen.getByText("Home").closest("a");
      const policiesLink = screen.getByText("Policies").closest("a");
      const vendorsLink = screen.getByText("Vendors").closest("a");

      expect(homeLink).toHaveAttribute("href", "/");
      expect(policiesLink).toHaveAttribute("href", "/policies");
      expect(vendorsLink).toHaveAttribute("href", "/vendors");
    });
  });

  describe("branding section", () => {
    it("displays brand name and subtitle", () => {
      render(<Sidebar />);

      expect(screen.getByText("Interdict")).toBeInTheDocument();
      expect(screen.getByText("Compliance")).toBeInTheDocument();
    });
  });

  describe("status indicator", () => {
    it("shows control plane online status", () => {
      render(<Sidebar />);

      expect(screen.getByText("Control Plane Online")).toBeInTheDocument();
    });
  });

  describe("collapse toggle", () => {
    it("renders collapse button with initial text", () => {
      render(<Sidebar />);

      const collapseButton = screen.getByRole("button");
      expect(collapseButton).toBeInTheDocument();
      expect(screen.getByText("Collapse")).toBeInTheDocument();
    });

    it("toggles collapse state when clicked", async () => {
      const user = userEvent.setup();
      render(<Sidebar />);

      const collapseButton = screen.getByRole("button");

      // Initially expanded - should show brand text
      expect(screen.getByText("Interdict")).toBeInTheDocument();

      // Click to collapse
      await user.click(collapseButton);

      // Check that sidebar has collapsed width class
      const sidebar = screen.getByRole("complementary", { hidden: true });
      expect(sidebar).toHaveClass("w-16");

      // Brand text should still be visible but collapse button text should be gone
      expect(screen.queryByText("Collapse")).not.toBeInTheDocument();
    });
  });

  describe("responsive behavior", () => {
    it("maintains proper structure when collapsed", async () => {
      const user = userEvent.setup();
      render(<Sidebar />);

      const collapseButton = screen.getByRole("button");
      await user.click(collapseButton);

      // Navigation items should still be accessible
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Policies")).toBeInTheDocument();

      const sidebar = screen.getByRole("complementary", { hidden: true });
      expect(sidebar).toHaveClass("w-16");
    });
  });
});
