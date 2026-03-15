/**
 * Tests for dashboard/src/components/layout/RouteError.tsx
 *
 * Validates error display, custom error messages, and retry button
 * functionality for the route-level error boundary.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { RouteError } from "@/components/layout/RouteError";

describe("RouteError", () => {
  it("renders error message and retry button", () => {
    const error = new Error("Network timeout");
    const reset = vi.fn();

    render(<RouteError error={error} reset={reset} />);

    expect(screen.getByText("Dashboard Error")).toBeInTheDocument();
    expect(
      screen.getByText("This workspace view failed to load."),
    ).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("calls reset when retry button is clicked", async () => {
    const user = userEvent.setup();
    const error = new Error("Server error");
    const reset = vi.fn();

    render(<RouteError error={error} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("shows fallback message when error.message is empty", () => {
    const error = new Error("");
    const reset = vi.fn();

    render(<RouteError error={error} reset={reset} />);

    expect(
      screen.getByText("An unexpected error interrupted the dashboard."),
    ).toBeInTheDocument();
  });

  it("has no axe-core accessibility violations", async () => {
    const error = new Error("Test error");
    const reset = vi.fn();

    const { container } = render(<RouteError error={error} reset={reset} />);

    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
