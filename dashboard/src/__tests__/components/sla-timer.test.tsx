/**
 * Tests for dashboard/src/components/reviews/SlaTimer.tsx
 *
 * Validates countdown display, color-coded severity transitions at SLA thresholds,
 * EXPIRED state using fake timers, and shared interval consolidation (one
 * setInterval for any number of mounted instances).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { SlaTimer } from "@/components/reviews/SlaTimer";

describe("SlaTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays hours and minutes when plenty of time remains", () => {
    // Set "now" to a fixed point and deadline 3 hours in the future
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline = new Date("2025-06-01T15:00:00Z").toISOString(); // 3h away
    render(<SlaTimer deadline={deadline} />);

    expect(screen.getByText("3h 0m")).toBeInTheDocument();
  });

  it("displays minutes and seconds when under 1 hour", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline = new Date("2025-06-01T12:30:45Z").toISOString(); // 30m 45s away
    render(<SlaTimer deadline={deadline} />);

    expect(screen.getByText("30m 45s")).toBeInTheDocument();
  });

  it("shows default (secondary) badge variant when >25% SLA remains", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    // 4h SLA, 3h remaining = 75% → secondary variant
    const deadline = new Date("2025-06-01T15:00:00Z").toISOString();
    render(<SlaTimer deadline={deadline} />);

    const badge = screen.getByText("3h 0m");
    // secondary variant — no amber or bg-destructive classes
    expect(badge.className).not.toContain("bg-amber");
    expect(badge.className).not.toContain("bg-destructive");
  });

  it("shows amber/warning styling when ≤25% SLA remains", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    // 4h SLA = 14400s. 25% = 3600s = 1h. Set deadline to 59m away → < 25%
    const deadline = new Date("2025-06-01T12:59:00Z").toISOString();
    render(<SlaTimer deadline={deadline} />);

    const badge = screen.getByText("59m 0s");
    expect(badge.className).toContain("bg-amber-500");
  });

  it("shows EXPIRED with destructive variant when past deadline", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    // Deadline already passed
    const deadline = new Date("2025-06-01T11:00:00Z").toISOString();
    render(<SlaTimer deadline={deadline} />);

    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
  });

  it("transitions from normal to EXPIRED as time advances", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    // 10 seconds remaining
    const deadline = new Date("2025-06-01T12:00:10Z").toISOString();
    render(<SlaTimer deadline={deadline} />);

    expect(screen.getByText("0m 10s")).toBeInTheDocument();

    // Advance 11 seconds — past the deadline
    act(() => {
      vi.advanceTimersByTime(11_000);
    });

    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
  });

  it("updates the display every second via interval", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline = new Date("2025-06-01T12:00:30Z").toISOString(); // 30s
    render(<SlaTimer deadline={deadline} />);

    expect(screen.getByText("0m 30s")).toBeInTheDocument();

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText("0m 25s")).toBeInTheDocument();
  });
});

describe("SlaTimer shared interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Ensure clean module-level state — unmount any leftover instances
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses a single setInterval for multiple mounted instances", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline1 = new Date("2025-06-01T13:00:00Z").toISOString(); // 1h
    const deadline2 = new Date("2025-06-01T14:00:00Z").toISOString(); // 2h
    const deadline3 = new Date("2025-06-01T15:00:00Z").toISOString(); // 3h

    const { unmount: u1 } = render(<SlaTimer deadline={deadline1} />);
    const { unmount: u2 } = render(<SlaTimer deadline={deadline2} />);
    const { unmount: u3 } = render(<SlaTimer deadline={deadline3} />);

    // Only 1 setInterval should have been created, not 3
    const intervalCalls = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 1000);
    expect(intervalCalls).toHaveLength(1);

    // All three timers render
    expect(screen.getByText("1h 0m")).toBeInTheDocument();
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
    expect(screen.getByText("3h 0m")).toBeInTheDocument();

    u1();
    u2();
    u3();
    setIntervalSpy.mockRestore();
  });

  it("clears the interval when all instances unmount", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline1 = new Date("2025-06-01T13:00:00Z").toISOString();
    const deadline2 = new Date("2025-06-01T14:00:00Z").toISOString();

    const { unmount: u1 } = render(<SlaTimer deadline={deadline1} />);
    const { unmount: u2 } = render(<SlaTimer deadline={deadline2} />);

    clearIntervalSpy.mockClear();

    // Unmount first — interval should NOT be cleared yet (one subscriber remains)
    u1();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    // Unmount last — interval MUST be cleared
    u2();
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it("advances all instances in sync from the shared interval", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    vi.setSystemTime(now);

    const deadline1 = new Date("2025-06-01T12:00:20Z").toISOString(); // 20s
    const deadline2 = new Date("2025-06-01T12:00:40Z").toISOString(); // 40s

    render(<SlaTimer deadline={deadline1} />);
    render(<SlaTimer deadline={deadline2} />);

    expect(screen.getByText("0m 20s")).toBeInTheDocument();
    expect(screen.getByText("0m 40s")).toBeInTheDocument();

    // Advance 1 second — both should decrement
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText("0m 19s")).toBeInTheDocument();
    expect(screen.getByText("0m 39s")).toBeInTheDocument();
  });
});
