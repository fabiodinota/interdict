/**
 * Tests for dashboard/src/components/policies/TemplatePicker.tsx
 *
 * Validates template card grid rendering, selection callback, back button,
 * and empty state for categories with no templates.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplatePicker } from "@/components/policies/TemplatePicker";
import type { PolicyTemplate } from "@/types/policy-templates";

// Mock the template data source
vi.mock("@/lib/rego-templates", () => ({
  getTemplatesForCategory: vi.fn((category: string) => {
    if (category === "vendor_control") {
      return [
        {
          id: "block-vendor",
          category: "vendor_control",
          name: "Block Vendor",
          description: "Block a specific vendor entirely",
          parameters: [{ key: "vendor", label: "Vendor", type: "text", required: true }],
        },
        {
          id: "allow-models",
          category: "vendor_control",
          name: "Allow Models",
          description: "Allow only specific models",
          parameters: [
            { key: "vendor", label: "Vendor", type: "text", required: true },
            { key: "models", label: "Models", type: "multi-select", required: true },
          ],
        },
      ] as PolicyTemplate[];
    }
    return [];
  }),
}));

describe("TemplatePicker", () => {
  const defaultProps = {
    category: "vendor_control" as const,
    selectedTemplate: null,
    onSelect: vi.fn(),
    onBack: vi.fn(),
  };

  it("renders template cards and calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<TemplatePicker {...defaultProps} onSelect={onSelect} />);

    expect(screen.getByText("Choose a Template")).toBeInTheDocument();
    expect(screen.getByText("Block Vendor")).toBeInTheDocument();
    expect(screen.getByText("Allow Models")).toBeInTheDocument();
    expect(screen.getByText("1 configurable parameter")).toBeInTheDocument();
    expect(screen.getByText("2 configurable parameters")).toBeInTheDocument();

    await user.click(screen.getByText("Block Vendor"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "block-vendor" }));
  });

  it("calls onBack when back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<TemplatePicker {...defaultProps} onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows empty state when category has no templates", () => {
    render(<TemplatePicker {...defaultProps} category={"custom" as const} />);

    expect(screen.getByText(/no templates available/i)).toBeInTheDocument();
  });
});
