/**
 * Tests for dashboard/src/components/policies/PolicyWizard.tsx
 *
 * Multi-step wizard: Category → Template → Parameters → Rules → Review.
 * Mock all child components to isolate wizard step logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyWizard } from "@/components/policies/PolicyWizard";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: () => null, // no edit mode
  }),
}));

// Mock policy hooks
const mockCreateMutateAsync = vi.fn().mockResolvedValue({});
const mockUpdateMutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/hooks/use-policies", () => ({
  usePolicy: () => ({ data: undefined }),
  useCreatePolicy: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdatePolicy: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

// Mock child components — each renders a simple div with a callback button
vi.mock("@/components/policies/CategoryPicker", () => ({
  CategoryPicker: ({ onSelect }: any) => (
    <div data-testid="category-picker">
      <button
        data-testid="select-category"
        onClick={() => onSelect("vendor_control")}
      >
        Pick Category
      </button>
    </div>
  ),
}));

vi.mock("@/components/policies/TemplatePicker", () => ({
  TemplatePicker: ({ onSelect, onBack }: any) => (
    <div data-testid="template-picker">
      <button
        data-testid="select-template"
        onClick={() =>
          onSelect({
            id: "tmpl-1",
            category: "vendor_control",
            name: "Vendor Block",
            description: "Block a vendor",
            parameters: [],
            generateRego: () => 'package interdict.policy\ndefault verdict := {"action": "block"}',
          })
        }
      >
        Pick Template
      </button>
      <button data-testid="template-back" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock("@/components/policies/ParameterForm", () => ({
  ParameterForm: ({ onNext, onBack }: any) => (
    <div data-testid="parameter-form">
      <button data-testid="params-next" onClick={onNext}>
        Next
      </button>
      <button data-testid="params-back" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock("@/components/policies/RuleEditor", () => ({
  RuleEditor: ({ onNext, onBack, onSkip }: any) => (
    <div data-testid="rule-editor">
      <button data-testid="rules-next" onClick={onNext}>
        Next
      </button>
      <button data-testid="rules-back" onClick={onBack}>
        Back
      </button>
      <button data-testid="rules-skip" onClick={onSkip}>
        Skip
      </button>
    </div>
  ),
  generateConditionRego: () => "",
}));

vi.mock("@/components/policies/RegoPreview", () => ({
  RegoPreview: ({
    onSubmit,
    onBack,
    onNameChange,
    policyName,
  }: any) => (
    <div data-testid="rego-preview">
      <button
        data-testid="preview-submit"
        onClick={() => {
          // Simulate filling name before submit
          onNameChange("Test Policy");
          onSubmit();
        }}
      >
        Submit
      </button>
      <button data-testid="preview-back" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock("@/components/policies/RawRegoEditor", () => ({
  RawRegoEditor: ({ onSubmit, policyName }: any) => (
    <div data-testid="raw-rego-editor">
      <button data-testid="raw-submit" onClick={onSubmit}>
        Raw Submit
      </button>
    </div>
  ),
}));

// Mock radix Dialog for switch warning
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="warning-dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

describe("PolicyWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders step 1 (CategoryPicker) initially", () => {
    render(<PolicyWizard />);

    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("template-picker")).not.toBeInTheDocument();
  });

  it("shows mode toggle button", () => {
    render(<PolicyWizard />);

    expect(screen.getByText("Switch to Raw Editor")).toBeInTheDocument();
  });

  it("renders step indicator with step labels", () => {
    render(<PolicyWizard />);

    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText("Parameters")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("navigates from step 1 to step 2 when a category is selected", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByTestId("select-category"));

    expect(screen.getByTestId("template-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
  });

  it("navigates from step 2 to step 3 when a template is selected", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    // Step 1 → Step 2
    await user.click(screen.getByTestId("select-category"));
    // Step 2 → Step 3
    await user.click(screen.getByTestId("select-template"));

    expect(screen.getByTestId("parameter-form")).toBeInTheDocument();
  });

  it("navigates from step 3 to step 4 on Next", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByTestId("select-category"));
    await user.click(screen.getByTestId("select-template"));
    await user.click(screen.getByTestId("params-next"));

    expect(screen.getByTestId("rule-editor")).toBeInTheDocument();
  });

  it("navigates from step 4 to step 5 on Next", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByTestId("select-category"));
    await user.click(screen.getByTestId("select-template"));
    await user.click(screen.getByTestId("params-next"));
    await user.click(screen.getByTestId("rules-next"));

    expect(screen.getByTestId("rego-preview")).toBeInTheDocument();
  });

  it("can skip rules step", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByTestId("select-category"));
    await user.click(screen.getByTestId("select-template"));
    await user.click(screen.getByTestId("params-next"));
    await user.click(screen.getByTestId("rules-skip"));

    expect(screen.getByTestId("rego-preview")).toBeInTheDocument();
  });

  it("can navigate back from step 2 to step 1", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByTestId("select-category"));
    expect(screen.getByTestId("template-picker")).toBeInTheDocument();

    await user.click(screen.getByTestId("template-back"));
    expect(screen.getByTestId("category-picker")).toBeInTheDocument();
  });

  it("switches to raw editor mode when toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    await user.click(screen.getByText("Switch to Raw Editor"));

    expect(screen.getByTestId("raw-rego-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("category-picker")).not.toBeInTheDocument();
  });

  it("shows warning dialog when switching from raw back to wizard", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    // Switch to raw
    await user.click(screen.getByText("Switch to Raw Editor"));
    expect(screen.getByTestId("raw-rego-editor")).toBeInTheDocument();

    // Switch back to wizard — should show warning
    await user.click(screen.getByText("Switch to Wizard"));
    expect(screen.getByTestId("warning-dialog")).toBeInTheDocument();
    expect(screen.getByText("Switch to Wizard Mode?")).toBeInTheDocument();
  });

  it("calls createPolicy on wizard submission", async () => {
    const user = userEvent.setup();
    render(<PolicyWizard />);

    // Navigate through all steps
    await user.click(screen.getByTestId("select-category"));
    await user.click(screen.getByTestId("select-template"));
    await user.click(screen.getByTestId("params-next"));
    await user.click(screen.getByTestId("rules-next"));
    await user.click(screen.getByTestId("preview-submit"));

    expect(mockCreateMutateAsync).toHaveBeenCalled();
  });
});
