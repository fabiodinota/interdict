/**
 * Tests for dashboard/src/components/vendors/VendorCard.tsx
 *
 * Validates card rendering, status badge, and toggle interaction
 * for vendor cards.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorCard } from "@/components/vendors/VendorCard";
import type { Vendor } from "@/hooks/use-vendors";

// Mock the vendor update hook
const mockUpdateMutate = vi.fn();
vi.mock("@/hooks/use-vendors", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/hooks/use-vendors");
  return {
    ...actual,
    useUpdateVendor: () => ({
      mutate: mockUpdateMutate,
      isPending: false,
    }),
  };
});

// Mock ModelList to avoid cascading hook dependencies
vi.mock("@/components/vendors/ModelList", () => ({
  ModelList: () => <div data-testid="model-list">Models</div>,
}));

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor => ({
  id: "v-1",
  name: "openai",
  display_name: "OpenAI",
  slug: "openai",
  base_url: "https://api.openai.com",
  description: "Leading AI provider",
  status: "approved",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  models: [],
  ...overrides,
});

describe("VendorCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders vendor details with approved badge", () => {
    render(<VendorCard vendor={makeVendor()} />);

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Leading AI provider")).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("https://api.openai.com")).toBeInTheDocument();
    expect(screen.getByText("Show models (0)")).toBeInTheDocument();
  });

  it("renders blocked badge for blocked vendors", () => {
    render(<VendorCard vendor={makeVendor({ status: "blocked" })} />);

    expect(screen.getByText("blocked")).toBeInTheDocument();
  });

  it("calls updateVendor to block when approved vendor toggle is clicked", async () => {
    const user = userEvent.setup();

    render(<VendorCard vendor={makeVendor()} />);

    const toggle = screen.getByRole("switch");
    await user.click(toggle);

    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: "v-1",
      status: "blocked",
    });
  });

  it("uses name as fallback when display_name is empty", () => {
    render(<VendorCard vendor={makeVendor({ display_name: "", name: "anthropic" })} />);

    // When display_name is empty string, the `||` falls through to name
    expect(screen.getByText("anthropic")).toBeInTheDocument();
  });

  it("toggles models section when show/hide is clicked", async () => {
    const user = userEvent.setup();

    render(<VendorCard vendor={makeVendor({ models: [] })} />);

    expect(screen.queryByTestId("model-list")).not.toBeInTheDocument();

    await user.click(screen.getByText("Show models (0)"));
    expect(screen.getByTestId("model-list")).toBeInTheDocument();

    await user.click(screen.getByText("Hide models"));
    expect(screen.queryByTestId("model-list")).not.toBeInTheDocument();
  });

  it("toggle button has aria-expanded reflecting visibility state", async () => {
    const user = userEvent.setup();

    render(<VendorCard vendor={makeVendor({ models: [] })} />);

    const toggleBtn = screen.getByText("Show models (0)");
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(toggleBtn);
    expect(screen.getByText("Hide models")).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByText("Hide models"));
    expect(screen.getByText("Show models (0)")).toHaveAttribute("aria-expanded", "false");
  });
});
