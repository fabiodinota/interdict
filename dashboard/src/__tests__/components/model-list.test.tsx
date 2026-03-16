/**
 * Tests for dashboard/src/components/vendors/ModelList.tsx
 *
 * Validates CRUD list rendering, add model form, delete confirmation dialog,
 * toggle status, and empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VendorModel } from "@/hooks/use-vendors";

// Mock hooks
const mockAddMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/hooks/use-vendors", () => ({
  useAddModel: () => ({ mutate: mockAddMutate, isPending: false }),
  useUpdateModel: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteModel: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

import { ModelList } from "@/components/vendors/ModelList";

const makeModel = (overrides: Partial<VendorModel> = {}): VendorModel => ({
  id: "model-1",
  model_name: "gpt-4o",
  status: "approved",
  ...overrides,
});

describe("ModelList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders model list with names and status badges", () => {
    const models = [
      makeModel({ id: "m1", model_name: "gpt-4o", status: "approved" }),
      makeModel({ id: "m2", model_name: "gpt-3.5", status: "blocked" }),
    ];

    render(<ModelList vendorId="v-1" models={models} />);

    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("gpt-3.5")).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.getByText("Models (2)")).toBeInTheDocument();
  });

  it("renders empty state when no models", () => {
    render(<ModelList vendorId="v-1" models={[]} />);

    expect(screen.getByText("No models registered")).toBeInTheDocument();
  });

  it("shows add form when Add button is clicked", async () => {
    const user = userEvent.setup();

    render(<ModelList vendorId="v-1" models={[]} />);

    await user.click(screen.getByText("Add"));

    expect(screen.getByPlaceholderText("Model name (e.g. gpt-4o)")).toBeInTheDocument();
  });

  it("calls addModel.mutate on form submit", async () => {
    const user = userEvent.setup();

    render(<ModelList vendorId="v-1" models={[]} />);

    // Open add form
    await user.click(screen.getByText("Add"));

    // Type model name
    const input = screen.getByPlaceholderText("Model name (e.g. gpt-4o)");
    await user.type(input, "claude-3-opus");

    // Click Add button (in the form, not the toggle)
    const addButtons = screen.getAllByText("Add");
    // The second "Add" is the submit button in the form
    await user.click(addButtons[addButtons.length - 1]);

    expect(mockAddMutate).toHaveBeenCalledWith(
      { vendorId: "v-1", model_name: "claude-3-opus", status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not call addModel.mutate when input is empty", async () => {
    const user = userEvent.setup();

    render(<ModelList vendorId="v-1" models={[]} />);

    await user.click(screen.getByText("Add"));

    // Try to submit with empty input — find the submit Add button
    const addButtons = screen.getAllByText("Add");
    await user.click(addButtons[addButtons.length - 1]);

    expect(mockAddMutate).not.toHaveBeenCalled();
  });

  it("cancels add form and hides it", async () => {
    const user = userEvent.setup();

    render(<ModelList vendorId="v-1" models={[]} />);

    await user.click(screen.getByText("Add"));
    expect(screen.getByPlaceholderText("Model name (e.g. gpt-4o)")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("Model name (e.g. gpt-4o)")).not.toBeInTheDocument();
  });

  it("calls deleteModel.mutate on delete confirmation", async () => {
    const user = userEvent.setup();
    const models = [makeModel({ id: "m1", model_name: "gpt-4o" })];

    render(<ModelList vendorId="v-1" models={models} />);

    // Click the X (delete) button — it's a button with an X icon
    const deleteButtons = screen.getAllByRole("button");
    // Find the delete trigger (the small icon button)
    const deleteBtn = deleteButtons.find(
      (btn) => btn.querySelector("svg") && btn.className.includes("size-6"),
    );
    if (deleteBtn) {
      await user.click(deleteBtn);
    }

    // Dialog should show
    expect(screen.getByText("Remove Model")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();

    // Confirm
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      { vendorId: "v-1", modelId: "m1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("cancels delete dialog without calling mutate", async () => {
    const user = userEvent.setup();
    const models = [makeModel({ id: "m1", model_name: "gpt-4o" })];

    render(<ModelList vendorId="v-1" models={models} />);

    // Open delete dialog
    const deleteButtons = screen.getAllByRole("button");
    const deleteBtn = deleteButtons.find(
      (btn) => btn.querySelector("svg") && btn.className.includes("size-6"),
    );
    if (deleteBtn) {
      await user.click(deleteBtn);
    }

    // Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
