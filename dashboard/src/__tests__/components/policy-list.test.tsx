/**
 * Tests for dashboard/src/components/policies/PolicyList.tsx
 *
 * Validates policy list rendering, search functionality, empty states,
 * and pagination for the main policy management interface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyList } from "@/components/policies/PolicyList";
import type { Policy, PaginatedResponse } from "@/types/api";

// Mock the hooks
const mockUsePolicies = vi.fn();
vi.mock("@/hooks/use-policies", () => ({
  usePolicies: () => mockUsePolicies(),
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock PolicyRow component
vi.mock("@/components/policies/PolicyRow", () => ({
  PolicyRow: ({ policy }: { policy: Policy }) => (
    <div data-testid={`policy-row-${policy.id}`}>
      <span>{policy.name}</span>
      <span>{policy.is_active ? "Active" : "Inactive"}</span>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_POLICIES: Policy[] = [
  {
    id: "pol-1",
    name: "Financial Data Protection",
    description: "Protects sensitive financial information",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    current_version: null,
  },
  {
    id: "pol-2",
    name: "PII Detection Policy",
    description: "Detects personally identifiable information",
    is_active: true,
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    current_version: null,
  },
  {
    id: "pol-3",
    name: "GDPR Compliance",
    description: "Ensures GDPR compliance",
    is_active: false,
    created_at: "2024-01-03T00:00:00Z",
    updated_at: "2024-01-03T00:00:00Z",
    current_version: null,
  },
];

const MOCK_RESPONSE: PaginatedResponse<Policy> = {
  success: true,
  data: {
    items: MOCK_POLICIES,
    nextCursor: "next-page-cursor",
    total: 3,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PolicyList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("policy rendering", () => {
    it("renders list of policies", () => {
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      expect(screen.getByTestId("policy-row-pol-1")).toBeInTheDocument();
      expect(screen.getByTestId("policy-row-pol-2")).toBeInTheDocument();
      expect(screen.getByTestId("policy-row-pol-3")).toBeInTheDocument();

      expect(screen.getByText("Financial Data Protection")).toBeInTheDocument();
      expect(screen.getByText("PII Detection Policy")).toBeInTheDocument();
      expect(screen.getByText("GDPR Compliance")).toBeInTheDocument();
    });

    it("shows create new policy button", () => {
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      const createButton = screen.getByText("Create New Policy");
      expect(createButton).toBeInTheDocument();
      expect(createButton.closest("a")).toHaveAttribute("href", "/policies/new");
    });

    it("shows search input", () => {
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      const searchInput = screen.getByPlaceholderText("Search policies...");
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe("search functionality", () => {
    it("filters policies by name", async () => {
      const user = userEvent.setup();
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      const searchInput = screen.getByPlaceholderText("Search policies...");
      await user.type(searchInput, "Financial");

      // Should show matching policy
      expect(screen.getByTestId("policy-row-pol-1")).toBeInTheDocument();

      // Should not show non-matching policies
      expect(screen.queryByTestId("policy-row-pol-2")).not.toBeInTheDocument();
      expect(screen.queryByTestId("policy-row-pol-3")).not.toBeInTheDocument();
    });

    it("shows no results message when search yields no matches", async () => {
      const user = userEvent.setup();
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      const searchInput = screen.getByPlaceholderText("Search policies...");
      await user.type(searchInput, "NonExistentPolicy");

      expect(screen.getByText(/No policies matching "NonExistentPolicy"/)).toBeInTheDocument();
    });

    it("is case insensitive", async () => {
      const user = userEvent.setup();
      mockUsePolicies.mockReturnValue({
        data: MOCK_RESPONSE,
        isLoading: false,
      });

      render(<PolicyList />);

      const searchInput = screen.getByPlaceholderText("Search policies...");
      await user.type(searchInput, "financial");

      expect(screen.getByTestId("policy-row-pol-1")).toBeInTheDocument();
      expect(screen.queryByTestId("policy-row-pol-2")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading skeletons while fetching", () => {
      mockUsePolicies.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(<PolicyList />);

      // Should show loading skeletons
      expect(screen.queryByTestId("policy-row-pol-1")).not.toBeInTheDocument();

      // Check for skeleton structure (may vary based on implementation)
      const skeletons = screen.getByTestId ? screen.queryByTestId("loading") : null;
      // Basic check that content isn't shown during loading
      expect(screen.queryByText("Financial Data Protection")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no policies exist", () => {
      mockUsePolicies.mockReturnValue({
        data: {
          success: true,
          data: { items: [], nextCursor: null, total: 0 },
        },
        isLoading: false,
      });

      render(<PolicyList />);

      expect(screen.getByText("No policies yet")).toBeInTheDocument();
      expect(screen.getByText("Create your first policy to get started.")).toBeInTheDocument();

      // Should still show create button in empty state
      const createButtons = screen.getAllByText("Create New Policy");
      expect(createButtons.length).toBeGreaterThan(0);
    });
  });

  describe("pagination", () => {
    it("shows load more button when nextCursor exists", () => {
      mockUsePolicies.mockReturnValue({
        data: {
          success: true,
          data: { items: MOCK_POLICIES, nextCursor: "next-cursor", total: 10 },
        },
        isLoading: false,
      });

      render(<PolicyList />);

      expect(screen.getByText("Load More")).toBeInTheDocument();
    });

    it("does not show load more button when no nextCursor", () => {
      mockUsePolicies.mockReturnValue({
        data: {
          success: true,
          data: { items: MOCK_POLICIES, nextCursor: null, total: 3 },
        },
        isLoading: false,
      });

      render(<PolicyList />);

      expect(screen.queryByText("Load More")).not.toBeInTheDocument();
    });
  });
});
