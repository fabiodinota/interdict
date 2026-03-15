/**
 * Tests for dashboard/src/components/policies/RawRegoEditor.tsx
 *
 * Code editor with policy metadata fields, line numbers, and submit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RawRegoEditor } from "@/components/policies/RawRegoEditor";

describe("RawRegoEditor", () => {
  const defaultProps = {
    regoSource: "",
    policyName: "",
    policyDescription: "",
    entrypoint: "interdict/policy/verdict",
    onRegoChange: vi.fn(),
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onEntrypointChange: vi.fn(),
    onSubmit: vi.fn(),
    isSubmitting: false,
    submitError: null,
    isEditMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and metadata fields", () => {
    render(<RawRegoEditor {...defaultProps} />);

    expect(screen.getByText("Raw Rego Editor")).toBeInTheDocument();
    expect(screen.getByLabelText(/Policy Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Entrypoint/)).toBeInTheDocument();
  });

  it("shows Create Policy button when not in edit mode", () => {
    render(<RawRegoEditor {...defaultProps} />);
    expect(screen.getByText("Create Policy")).toBeInTheDocument();
  });

  it("shows Update Policy button when in edit mode", () => {
    render(<RawRegoEditor {...defaultProps} isEditMode={true} />);
    expect(screen.getByText("Update Policy")).toBeInTheDocument();
  });

  it("disables submit when required fields are empty", () => {
    render(<RawRegoEditor {...defaultProps} />);

    const submitBtn = screen.getByText("Create Policy");
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit when name, rego, and entrypoint are all filled", () => {
    render(
      <RawRegoEditor
        {...defaultProps}
        policyName="Test Policy"
        regoSource="package interdict.policy"
        entrypoint="interdict/policy/verdict"
      />,
    );

    const submitBtn = screen.getByText("Create Policy");
    expect(submitBtn).not.toBeDisabled();
  });

  it("calls onSubmit when submit button is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <RawRegoEditor
        {...defaultProps}
        policyName="Test"
        regoSource="package test"
        entrypoint="test/verdict"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByText("Create Policy"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("displays submit error when present", () => {
    render(<RawRegoEditor {...defaultProps} submitError="Syntax error in rego" />);

    expect(screen.getByText("Rego Validation Error")).toBeInTheDocument();
    expect(screen.getByText("Syntax error in rego")).toBeInTheDocument();
  });

  it("does not display error when submitError is null", () => {
    render(<RawRegoEditor {...defaultProps} />);
    expect(screen.queryByText("Rego Validation Error")).not.toBeInTheDocument();
  });

  it("renders line numbers for rego source", () => {
    render(<RawRegoEditor {...defaultProps} regoSource={"line1\nline2\nline3"} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onNameChange when name input changes", async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();

    render(<RawRegoEditor {...defaultProps} onNameChange={onNameChange} />);

    const nameInput = screen.getByLabelText(/Policy Name/);
    await user.type(nameInput, "A");
    expect(onNameChange).toHaveBeenCalled();
  });
});
