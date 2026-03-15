/**
 * Tests for dashboard/src/components/theme-toggle.tsx
 *
 * Validates theme switching with next-themes mock and dropdown menu rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme-toggle";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  it("renders toggle button with screen reader label", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("shows theme options in dropdown and calls setTheme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    // Open dropdown
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    // All three options should be visible
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();

    // Click dark theme
    await user.click(screen.getByText("Dark"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
