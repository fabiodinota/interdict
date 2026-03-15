/**
 * Tests for dashboard/src/components/vendors/AddVendorDialog.tsx
 *
 * Validates form field rendering, successful submission, cancellation,
 * and validation (empty required fields).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hook
const mockMutate = vi.fn();

vi.mock("@/hooks/use-vendors", () => ({
  useCreateVendor: () => ({ mutate: mockMutate, isPending: false }),
}));

import { AddVendorDialog } from "@/components/vendors/AddVendorDialog";

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Add Vendor/ }));
}

describe("AddVendorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger button", () => {
    render(<AddVendorDialog />);

    expect(
      screen.getByRole("button", { name: /Add Vendor/ }),
    ).toBeInTheDocument();
  });

  it("opens dialog showing form fields when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    expect(screen.getByText("Add New Vendor")).toBeInTheDocument();
    expect(
      screen.getByText("Register a new AI vendor for policy enforcement."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Display Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });

  it("submits form with all fields filled", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    await user.type(screen.getByLabelText("Name *"), "anthropic");
    await user.type(screen.getByLabelText("Display Name *"), "Anthropic");
    await user.type(screen.getByLabelText("Base URL"), "https://api.anthropic.com");
    await user.type(screen.getByLabelText("Description"), "AI research company");

    await user.click(screen.getByRole("button", { name: "Create Vendor" }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        name: "anthropic",
        display_name: "Anthropic",
        base_url: "https://api.anthropic.com",
        description: "AI research company",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("submits form with only required fields", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    await user.type(screen.getByLabelText("Name *"), "openai");
    await user.type(screen.getByLabelText("Display Name *"), "OpenAI");

    await user.click(screen.getByRole("button", { name: "Create Vendor" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: "openai", display_name: "OpenAI" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not submit when required Name field is empty", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    // Only fill display name, leave name empty
    await user.type(screen.getByLabelText("Display Name *"), "OpenAI");

    // Create Vendor button should be disabled
    expect(
      screen.getByRole("button", { name: "Create Vendor" }),
    ).toBeDisabled();
  });

  it("does not submit when required Display Name field is empty", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    // Only fill name, leave display name empty
    await user.type(screen.getByLabelText("Name *"), "openai");

    expect(
      screen.getByRole("button", { name: "Create Vendor" }),
    ).toBeDisabled();
  });

  it("closes dialog on Cancel without submitting", async () => {
    const user = userEvent.setup();
    render(<AddVendorDialog />);

    await openDialog(user);

    await user.type(screen.getByLabelText("Name *"), "test");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
  });
});
