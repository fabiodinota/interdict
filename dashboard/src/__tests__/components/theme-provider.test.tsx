/**
 * Tests for dashboard/src/components/theme-provider.tsx
 *
 * ThemeProvider wraps next-themes NextThemesProvider — verify it renders children.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";

// Mock next-themes to avoid provider side-effects in test env
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="next-themes-provider">{children}</div>
  ),
}));

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <p>Hello World</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("wraps children with NextThemesProvider", () => {
    render(
      <ThemeProvider>
        <span>Child</span>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("next-themes-provider")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });
});
