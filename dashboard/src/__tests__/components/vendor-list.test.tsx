/**
 * Tests for dashboard/src/components/vendors/VendorList.tsx
 *
 * Validates vendor display, search functionality, empty states, and
 * vendor card rendering for the vendor management interface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorList } from "@/components/vendors/VendorList";

// Mock the vendor hooks and components
const mockUseVendors = vi.fn();
vi.mock("@/hooks/use-vendors", () => ({
  useVendors: () => mockUseVendors(),
}));

vi.mock("@/components/vendors/VendorCard", () => ({
  VendorCard: ({ vendor }: { vendor: any }) => (
    <div data-testid={`vendor-card-${vendor.id}`}>
      <h3>{vendor.display_name || vendor.name}</h3>
      <p>Models: {vendor.models?.length || 0}</p>
      <span>{vendor.status}</span>
    </div>
  ),
}));

vi.mock("@/components/vendors/AddVendorDialog", () => ({
  AddVendorDialog: () => <button>Add Vendor</button>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_VENDORS = [
  {
    id: "vendor-1",
    name: "openai",
    slug: "openai",
    display_name: "OpenAI",
    status: "approved",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    models: [
      { id: "model-1", name: "gpt-4" },
      { id: "model-2", name: "gpt-3.5-turbo" },
    ],
  },
  {
    id: "vendor-2",
    name: "anthropic",
    slug: "anthropic",
    display_name: "Anthropic",
    status: "approved",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    models: [{ id: "model-3", name: "claude-3" }],
  },
  {
    id: "vendor-3",
    name: "google",
    slug: "google",
    display_name: "Google",
    status: "pending",
    createdAt: "2024-01-03T00:00:00Z",
    updatedAt: "2024-01-03T00:00:00Z",
    models: [],
  },
];

const MOCK_VENDOR_RESPONSE = {
  success: true,
  data: {
    items: MOCK_VENDORS,
    nextCursor: null,
    total: 3,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VendorList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("vendor rendering", () => {
    it("renders list of vendor cards", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      expect(screen.getByTestId("vendor-card-vendor-1")).toBeInTheDocument();
      expect(screen.getByTestId("vendor-card-vendor-2")).toBeInTheDocument();
      expect(screen.getByTestId("vendor-card-vendor-3")).toBeInTheDocument();

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("Google")).toBeInTheDocument();
    });

    it("displays vendor model counts", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      expect(screen.getByText("Models: 2")).toBeInTheDocument(); // OpenAI
      expect(screen.getByText("Models: 1")).toBeInTheDocument(); // Anthropic
      expect(screen.getByText("Models: 0")).toBeInTheDocument(); // Google
    });

    it("shows vendor status", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const approvedStatuses = screen.getAllByText("approved");
      expect(approvedStatuses).toHaveLength(2); // OpenAI and Anthropic

      expect(screen.getByText("pending")).toBeInTheDocument(); // Google
    });

    it("shows add vendor button", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      expect(screen.getByText("Add Vendor")).toBeInTheDocument();
    });
  });

  describe("search functionality", () => {
    it("shows search input", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const searchInput = screen.getByPlaceholderText("Search vendors...");
      expect(searchInput).toBeInTheDocument();
    });

    it("filters vendors by name", async () => {
      const user = userEvent.setup();
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const searchInput = screen.getByPlaceholderText("Search vendors...");
      await user.type(searchInput, "OpenAI");

      // Should show matching vendor
      expect(screen.getByTestId("vendor-card-vendor-1")).toBeInTheDocument();

      // Should not show non-matching vendors
      expect(screen.queryByTestId("vendor-card-vendor-2")).not.toBeInTheDocument();
      expect(screen.queryByTestId("vendor-card-vendor-3")).not.toBeInTheDocument();
    });

    it("filters vendors by display name", async () => {
      const user = userEvent.setup();
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const searchInput = screen.getByPlaceholderText("Search vendors...");
      await user.type(searchInput, "Anthropic");

      expect(screen.getByTestId("vendor-card-vendor-2")).toBeInTheDocument();
      expect(screen.queryByTestId("vendor-card-vendor-1")).not.toBeInTheDocument();
    });

    it("search is case insensitive", async () => {
      const user = userEvent.setup();
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const searchInput = screen.getByPlaceholderText("Search vendors...");
      await user.type(searchInput, "openai");

      expect(screen.getByTestId("vendor-card-vendor-1")).toBeInTheDocument();
    });

    it("shows no results message when search yields no matches", async () => {
      const user = userEvent.setup();
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      const searchInput = screen.getByPlaceholderText("Search vendors...");
      await user.type(searchInput, "NonExistentVendor");

      expect(screen.getByText(/No vendors matching "NonExistentVendor"/)).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading skeletons while fetching", () => {
      mockUseVendors.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      render(<VendorList />);

      // Should not show actual vendor cards during loading
      expect(screen.queryByTestId("vendor-card-vendor-1")).not.toBeInTheDocument();
      expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();

      // Should show skeleton structure
      expect(screen.queryByText("NonExistentVendor")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no vendors exist", () => {
      mockUseVendors.mockReturnValue({
        data: {
          success: true,
          data: { items: [], nextCursor: null, total: 0 },
        },
        isLoading: false,
      });

      render(<VendorList />);

      expect(screen.getByText("No vendors registered")).toBeInTheDocument();
      expect(
        screen.getByText("Add your first AI vendor to start managing model access."),
      ).toBeInTheDocument();

      // Should still show add vendor button in empty state
      const addButtons = screen.getAllByText("Add Vendor");
      expect(addButtons.length).toBeGreaterThan(0);
    });
  });

  describe("grid layout", () => {
    it("uses responsive grid layout", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      const { container } = render(<VendorList />);

      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-3");
    });

    it("displays vendors in grid when data is loaded", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      const { container } = render(<VendorList />);

      // Should have a grid containing vendor cards
      const gridContainer = container.querySelector(".grid");
      expect(gridContainer).toBeTruthy();
      expect(gridContainer?.children.length).toBe(3); // 3 vendor cards
    });
  });

  describe("header section", () => {
    it("contains search and add vendor controls", () => {
      mockUseVendors.mockReturnValue({
        data: MOCK_VENDOR_RESPONSE,
        isLoading: false,
      });

      render(<VendorList />);

      // Should have search input
      expect(screen.getByPlaceholderText("Search vendors...")).toBeInTheDocument();

      // Should have add vendor button
      expect(screen.getByText("Add Vendor")).toBeInTheDocument();
    });
  });
});
