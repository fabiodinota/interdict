/**
 * Tests for dashboard/src/components/policies/CategoryPicker.tsx
 *
 * Validates category grid rendering, selection highlighting, click callbacks,
 * and template count display.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryPicker } from "@/components/policies/CategoryPicker";

// Mock rego-templates to control categories deterministically
vi.mock("@/lib/rego-templates", () => ({
  POLICY_CATEGORIES: [
    { id: "vendor_control", name: "Vendor Control", icon: "Building2", description: "Control vendors" },
    { id: "content_inspection", name: "Content Inspection", icon: "Shield", description: "Inspect content" },
    { id: "rate_limiting", name: "Rate Limiting", icon: "Gauge", description: "Limit rates" },
    { id: "custom", name: "Custom", icon: "Code", description: "Write custom rules" },
  ],
  getTemplatesForCategory: (id: string) => {
    const counts: Record<string, number> = {
      vendor_control: 3,
      content_inspection: 2,
      rate_limiting: 1,
      custom: 0,
    };
    return Array(counts[id] ?? 0).fill({});
  },
}));

describe("CategoryPicker", () => {
  const onSelect = vi.fn();

  it("renders all four category cards with names, descriptions, and template counts", () => {
    render(<CategoryPicker selectedCategory={null} onSelect={onSelect} />);

    expect(screen.getByText("Vendor Control")).toBeInTheDocument();
    expect(screen.getByText("Content Inspection")).toBeInTheDocument();
    expect(screen.getByText("Rate Limiting")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();

    expect(screen.getByText("Control vendors")).toBeInTheDocument();
    expect(screen.getByText("3 templates")).toBeInTheDocument();
    expect(screen.getByText("2 templates")).toBeInTheDocument();
    expect(screen.getByText("1 template")).toBeInTheDocument();
    expect(screen.getByText("0 templates")).toBeInTheDocument();
  });

  it("calls onSelect with the correct category id when a card is clicked", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker selectedCategory={null} onSelect={onSelect} />);

    await user.click(screen.getByText("Vendor Control"));
    expect(onSelect).toHaveBeenCalledWith("vendor_control");

    await user.click(screen.getByText("Custom"));
    expect(onSelect).toHaveBeenCalledWith("custom");
  });

  it("applies selected styling when a category is selected", () => {
    const { container } = render(
      <CategoryPicker selectedCategory="content_inspection" onSelect={onSelect} />,
    );

    // The selected card should have border-primary and ring classes
    const cards = container.querySelectorAll("[class*='cursor-pointer']");
    const selectedCard = Array.from(cards).find((card) =>
      card.textContent?.includes("Content Inspection"),
    );
    expect(selectedCard?.className).toContain("border-primary");
    expect(selectedCard?.className).toContain("ring-2");
  });

  it("does not apply selected styling to unselected categories", () => {
    const { container } = render(
      <CategoryPicker selectedCategory="vendor_control" onSelect={onSelect} />,
    );

    const cards = container.querySelectorAll("[class*='cursor-pointer']");
    const unselectedCard = Array.from(cards).find((card) =>
      card.textContent?.includes("Custom"),
    );
    expect(unselectedCard?.className).not.toContain("ring-2");
  });

  it("renders heading and description text", () => {
    render(<CategoryPicker selectedCategory={null} onSelect={onSelect} />);
    expect(screen.getByText("Choose a Category")).toBeInTheDocument();
    expect(
      screen.getByText("Select a policy category to get started with pre-built templates."),
    ).toBeInTheDocument();
  });
});
