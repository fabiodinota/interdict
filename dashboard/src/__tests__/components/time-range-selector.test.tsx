/**
 * Tests for dashboard/src/components/dashboard/TimeRangeSelector.tsx
 *
 * Validates range button selection, refresh callback, last-updated display,
 * and the getDateRange utility function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeRangeSelector, getDateRange } from "@/components/dashboard/TimeRangeSelector";

describe("TimeRangeSelector", () => {
  const onChange = vi.fn();
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all three range buttons", () => {
    render(
      <TimeRangeSelector
        value="24h"
        onChange={onChange}
        onRefresh={onRefresh}
        lastUpdated={null}
      />,
    );

    expect(screen.getByText("24h")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("30d")).toBeInTheDocument();
  });

  it("calls onChange with the selected range when a button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TimeRangeSelector
        value="24h"
        onChange={onChange}
        onRefresh={onRefresh}
        lastUpdated={null}
      />,
    );

    await user.click(screen.getByText("7d"));
    expect(onChange).toHaveBeenCalledWith("7d");

    await user.click(screen.getByText("30d"));
    expect(onChange).toHaveBeenCalledWith("30d");
  });

  it("calls onRefresh when the refresh button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TimeRangeSelector
        value="24h"
        onChange={onChange}
        onRefresh={onRefresh}
        lastUpdated={null}
      />,
    );

    // The refresh button is the last button (icon button)
    const buttons = screen.getAllByRole("button");
    const refreshButton = buttons[buttons.length - 1];
    await user.click(refreshButton);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("displays 'Last updated: Xs ago' when lastUpdated is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));

    const fiveSecondsAgo = new Date("2025-06-01T11:59:55Z");
    render(
      <TimeRangeSelector
        value="24h"
        onChange={onChange}
        onRefresh={onRefresh}
        lastUpdated={fiveSecondsAgo}
      />,
    );

    expect(screen.getByText("Last updated: 5s ago")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does not display last-updated text when lastUpdated is null", () => {
    render(
      <TimeRangeSelector
        value="7d"
        onChange={onChange}
        onRefresh={onRefresh}
        lastUpdated={null}
      />,
    );

    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});

describe("getDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 24-hour range", () => {
    const { from, to } = getDateRange("24h");
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("returns 7-day range", () => {
    const { from, to } = getDateRange("7d");
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns 30-day range", () => {
    const { from, to } = getDateRange("30d");
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
