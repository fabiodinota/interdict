/**
 * Tests for dashboard/src/components/signing-keys/RotateKeyDialog.tsx
 *
 * Validates dialog open/close, confirm/cancel actions, and pending state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RotateKeyDialog } from "@/components/signing-keys/RotateKeyDialog";

describe("RotateKeyDialog", () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <RotateKeyDialog
        open={false}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    expect(screen.queryByText("Rotate Signing Key")).not.toBeInTheDocument();
  });

  it("displays title and description when open", () => {
    render(
      <RotateKeyDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    expect(screen.getByText("Rotate Signing Key")).toBeInTheDocument();
    expect(
      screen.getByText(/generate a new Ed25519 keypair and retire the current active key/),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when Rotate Key button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <RotateKeyDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    await user.click(screen.getByText("Rotate Key"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <RotateKeyDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows 'Rotating...' and disables button when isPending is true", () => {
    render(
      <RotateKeyDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={true}
      />,
    );

    const rotateButton = screen.getByText("Rotating...");
    expect(rotateButton).toBeInTheDocument();
    expect(rotateButton.closest("button")).toBeDisabled();
  });

  it("shows 'Rotate Key' when not pending and button is enabled", () => {
    render(
      <RotateKeyDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />,
    );

    const rotateButton = screen.getByText("Rotate Key");
    expect(rotateButton.closest("button")).not.toBeDisabled();
  });
});
