/**
 * Tests for dashboard/src/components/policies/RegoPreview.tsx
 *
 * Validates rego source code display with syntax highlighting,
 * form fields for policy metadata, submit/back actions, and error state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegoPreview } from "@/components/policies/RegoPreview";

describe("RegoPreview", () => {
  const defaultProps = {
    regoSource: 'package interdict.policy\n\ndefault verdict = "allow"',
    policyName: "Block PII",
    policyDescription: "Blocks PII data",
    entrypoint: "interdict/policy/verdict",
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onEntrypointChange: vi.fn(),
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    isSubmitting: false,
    submitError: null,
    isEditMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders rego source code", () => {
    render(<RegoPreview {...defaultProps} />);

    expect(screen.getByText("Rego Source")).toBeInTheDocument();
    // Rego source should be rendered with syntax highlighting
    expect(screen.getByText("package")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("renders policy metadata form fields with values", () => {
    render(<RegoPreview {...defaultProps} />);

    expect(screen.getByLabelText(/Policy Name/)).toHaveValue("Block PII");
    expect(screen.getByLabelText("Description")).toHaveValue("Blocks PII data");
    expect(screen.getByLabelText("Entrypoint")).toHaveValue("interdict/policy/verdict");
  });

  it("calls onNameChange when policy name is changed", async () => {
    const user = userEvent.setup();
    render(<RegoPreview {...defaultProps} />);

    const nameInput = screen.getByLabelText(/Policy Name/);
    await user.clear(nameInput);
    await user.type(nameInput, "New Name");

    expect(defaultProps.onNameChange).toHaveBeenCalled();
  });

  it("calls onSubmit when Create Policy button is clicked", async () => {
    const user = userEvent.setup();
    render(<RegoPreview {...defaultProps} />);

    await user.click(screen.getByText("Create Policy"));

    expect(defaultProps.onSubmit).toHaveBeenCalled();
  });

  it("shows Update Policy button in edit mode", () => {
    render(<RegoPreview {...defaultProps} isEditMode={true} />);

    expect(screen.getByText("Update Policy")).toBeInTheDocument();
    expect(screen.queryByText("Create Policy")).not.toBeInTheDocument();
  });

  it("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    render(<RegoPreview {...defaultProps} />);

    // There are multiple Back buttons (ghost + outline variant)
    const backButtons = screen.getAllByText("Back");
    await user.click(backButtons[0]);

    expect(defaultProps.onBack).toHaveBeenCalled();
  });

  it("displays submit error when present", () => {
    render(<RegoPreview {...defaultProps} submitError="Invalid Rego syntax at line 3" />);

    expect(screen.getByText("Rego Validation Error")).toBeInTheDocument();
    expect(screen.getByText("Invalid Rego syntax at line 3")).toBeInTheDocument();
  });

  it("does not display error section when submitError is null", () => {
    render(<RegoPreview {...defaultProps} />);

    expect(screen.queryByText("Rego Validation Error")).not.toBeInTheDocument();
  });

  it("disables submit when policy name is empty", () => {
    render(<RegoPreview {...defaultProps} policyName="" />);

    const submitBtn = screen.getByText("Create Policy");
    expect(submitBtn).toBeDisabled();
  });

  it("disables submit when rego source is empty", () => {
    render(<RegoPreview {...defaultProps} regoSource="" />);

    const submitBtn = screen.getByText("Create Policy");
    expect(submitBtn).toBeDisabled();
  });
});
