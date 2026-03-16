/**
 * Tests for dashboard/src/components/policies/RuleEditor.tsx
 *
 * Visual rule builder with add/remove conditions, rego preview, navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuleEditor } from "@/components/policies/RuleEditor";
import type { RuleCondition } from "@/types/policy-templates";

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

describe("RuleEditor", () => {
  const defaultProps = {
    conditions: [] as RuleCondition[],
    onChange: vi.fn(),
    generatedRego: 'package interdict.policy\n\ndefault verdict := {"action": "allow"}',
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and description", () => {
    render(<RuleEditor {...defaultProps} />);

    expect(screen.getByText("Visual Rule Editor")).toBeInTheDocument();
    expect(screen.getByText(/Add additional conditions to your policy/)).toBeInTheDocument();
  });

  it("renders navigation buttons", () => {
    render(<RuleEditor {...defaultProps} />);

    // There are two Back buttons (ghost + outlined)
    const backButtons = screen.getAllByText("Back");
    expect(backButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Skip")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("renders Add Condition button", () => {
    render(<RuleEditor {...defaultProps} />);
    expect(screen.getByText("Add Condition")).toBeInTheDocument();
  });

  it("calls onChange with a new condition when Add Condition is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RuleEditor {...defaultProps} onChange={onChange} />);

    await user.click(screen.getByText("Add Condition"));
    expect(onChange).toHaveBeenCalledTimes(1);

    const newConditions = onChange.mock.calls[0][0];
    expect(newConditions).toHaveLength(1);
    expect(newConditions[0]).toMatchObject({
      field: "input.request.vendor",
      operator: "==",
      value: "",
      connector: "AND",
    });
  });

  it("renders condition rows when conditions are provided", () => {
    const conditions: RuleCondition[] = [
      {
        id: "c1",
        field: "input.request.vendor",
        operator: "==",
        value: "openai",
        connector: "AND",
      },
    ];

    render(<RuleEditor {...defaultProps} conditions={conditions} />);

    // The value input should have "openai"
    const valueInput = screen.getByDisplayValue("openai");
    expect(valueInput).toBeInTheDocument();
  });

  it("calls onChange to remove a condition when remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const conditions: RuleCondition[] = [
      { id: "c1", field: "input.request.vendor", operator: "==", value: "test", connector: "AND" },
    ];

    render(<RuleEditor {...defaultProps} conditions={conditions} onChange={onChange} />);

    const removeBtn = screen.getByLabelText("Remove condition");
    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows rego preview", () => {
    render(<RuleEditor {...defaultProps} />);

    expect(screen.getByText("Rego Preview")).toBeInTheDocument();
    expect(screen.getByText(/package interdict\.policy/)).toBeInTheDocument();
  });

  it("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<RuleEditor {...defaultProps} onBack={onBack} />);

    // Click the outlined "Back" button (last one)
    const backButtons = screen.getAllByText("Back");
    await user.click(backButtons[backButtons.length - 1]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip when Skip button is clicked", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();

    render(<RuleEditor {...defaultProps} onSkip={onSkip} />);

    await user.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when Next button is clicked", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(<RuleEditor {...defaultProps} onNext={onNext} />);

    await user.click(screen.getByText("Next"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
