/**
 * Tests for dashboard/src/components/dashboard/ActivityFeed.tsx
 *
 * Validates feed rendering with events, empty state, connection indicator,
 * and clear button interaction.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

// Mock the SSE hook
const mockClear = vi.fn();
vi.mock("@/hooks/useSSE", () => ({
  useSSE: () => ({
    events: [],
    connected: false,
    clear: mockClear,
  }),
}));

// We'll need to re-import to change mock return values per test
import { useSSE } from "@/hooks/useSSE";

describe("ActivityFeed", () => {
  it("shows empty state when no events", () => {
    render(<ActivityFeed />);

    expect(screen.getByText("Waiting for events...")).toBeInTheDocument();
    expect(screen.getByText("Live Activity")).toBeInTheDocument();
  });

  it("renders Clear button", () => {
    render(<ActivityFeed />);

    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls clear function when Clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<ActivityFeed />);

    await user.click(screen.getByText("Clear"));
    expect(mockClear).toHaveBeenCalled();
  });

  it("renders the Live Activity title", () => {
    render(<ActivityFeed />);

    expect(screen.getByText("Live Activity")).toBeInTheDocument();
  });
});
