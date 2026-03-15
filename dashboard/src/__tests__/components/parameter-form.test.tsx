/**
 * Tests for dashboard/src/components/policies/ParameterForm.tsx
 *
 * Dynamic parameter form driven by PolicyTemplate, with validation and rego preview.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParameterForm } from "@/components/policies/ParameterForm";
import type { PolicyTemplate } from "@/types/policy-templates";

// Mock radix Select for happy-dom
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

// Mock cmdk Command components
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandInput: ({ placeholder }: any) => <input placeholder={placeholder} />,
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: any) => (
    <div role="option" onClick={onSelect}>{children}</div>
  ),
}));

function makeTemplate(overrides?: Partial<PolicyTemplate>): PolicyTemplate {
  return {
    id: "test-template",
    category: "vendor_control",
    name: "Test Template",
    description: "A test template",
    parameters: [
      {
        key: "vendor_name",
        label: "Vendor Name",
        type: "text",
        required: true,
        placeholder: "e.g., OpenAI",
      },
      {
        key: "max_tokens",
        label: "Max Tokens",
        type: "number",
        required: false,
        placeholder: "1000",
      },
    ],
    generateRego: (params) =>
      `package interdict.policy\n# vendor: ${params.vendor_name ?? "none"}`,
    ...overrides,
  };
}

describe("ParameterForm", () => {
  const defaultProps = {
    template: makeTemplate(),
    values: {} as Record<string, unknown>,
    onChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and template name", () => {
    render(<ParameterForm {...defaultProps} />);

    expect(screen.getByText("Configure Parameters")).toBeInTheDocument();
    expect(screen.getByText(/Test Template/)).toBeInTheDocument();
  });

  it("renders parameter labels", () => {
    render(<ParameterForm {...defaultProps} />);

    expect(screen.getByText(/Vendor Name/)).toBeInTheDocument();
    expect(screen.getByText(/Max Tokens/)).toBeInTheDocument();
  });

  it("marks required fields with asterisk", () => {
    render(<ParameterForm {...defaultProps} />);

    // The Vendor Name label should have a required asterisk
    const vendorLabel = screen.getByText(/Vendor Name/);
    const asterisk = vendorLabel.parentElement?.querySelector(".text-destructive");
    expect(asterisk).toBeTruthy();
  });

  it("disables Next button when required fields are empty", () => {
    render(<ParameterForm {...defaultProps} values={{}} />);

    const nextBtn = screen.getByText("Next");
    expect(nextBtn).toBeDisabled();
  });

  it("enables Next button when required fields are filled", () => {
    render(<ParameterForm {...defaultProps} values={{ vendor_name: "OpenAI" }} />);

    const nextBtn = screen.getByText("Next");
    expect(nextBtn).not.toBeDisabled();
  });

  it("shows rego preview", () => {
    render(<ParameterForm {...defaultProps} values={{ vendor_name: "OpenAI" }} />);

    expect(screen.getByText("Rego Preview")).toBeInTheDocument();
    expect(screen.getByText(/vendor: OpenAI/)).toBeInTheDocument();
  });

  it("shows error preview when generateRego throws", () => {
    const badTemplate = makeTemplate({
      generateRego: () => {
        throw new Error("bad");
      },
    });

    render(<ParameterForm {...defaultProps} template={badTemplate} />);

    expect(screen.getByText("// Error generating Rego preview")).toBeInTheDocument();
  });

  it("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<ParameterForm {...defaultProps} onBack={onBack} />);

    // Click the outlined "Back" button
    const backButtons = screen.getAllByText("Back");
    await user.click(backButtons[backButtons.length - 1]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when Next button is clicked and form is valid", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <ParameterForm {...defaultProps} values={{ vendor_name: "OpenAI" }} onNext={onNext} />,
    );

    await user.click(screen.getByText("Next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders toggle parameter type", () => {
    const template = makeTemplate({
      parameters: [
        {
          key: "enabled",
          label: "Enable Feature",
          type: "toggle",
          required: false,
        },
      ],
    });

    render(<ParameterForm {...defaultProps} template={template} values={{}} />);
    expect(screen.getByText(/Enable Feature/)).toBeInTheDocument();
  });
});
