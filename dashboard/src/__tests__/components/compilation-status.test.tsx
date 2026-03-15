/**
 * Tests for dashboard/src/components/policies/CompilationStatus.tsx
 *
 * Validates status badge rendering for all compilation states with the
 * compilation hook mocked.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the compilation status hook
const mockUseCompilationStatus = vi.fn();
vi.mock("@/hooks/use-compilation-status", () => ({
  useCompilationStatus: (...args: unknown[]) => mockUseCompilationStatus(...args),
}));

import { CompilationStatus } from "@/components/policies/CompilationStatus";

describe("CompilationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Pending badge when status is pending", () => {
    mockUseCompilationStatus.mockReturnValue({
      data: { data: { status: "pending" } },
    });

    render(<CompilationStatus policyId="pol-1" />);

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Compiling badge with spinner when status is compiling", () => {
    mockUseCompilationStatus.mockReturnValue({
      data: { data: { status: "compiling" } },
    });

    render(<CompilationStatus policyId="pol-1" />);

    expect(screen.getByText("Compiling")).toBeInTheDocument();
  });

  it("renders Compiled badge with wasm info when status is compiled", () => {
    mockUseCompilationStatus.mockReturnValue({
      data: {
        data: {
          status: "compiled",
          wasmHash: "abc123def456789",
          wasmSize: 2048,
        },
      },
    });

    render(<CompilationStatus policyId="pol-1" />);

    expect(screen.getByText("Compiled")).toBeInTheDocument();
    expect(screen.getByText("abc123def456...")).toBeInTheDocument();
    expect(screen.getByText("(2.0 KB)")).toBeInTheDocument();
  });

  it("renders Failed badge and shows error on click", async () => {
    const user = userEvent.setup();
    mockUseCompilationStatus.mockReturnValue({
      data: {
        data: {
          status: "failed",
          error: "Syntax error in policy rule",
        },
      },
    });

    render(<CompilationStatus policyId="pol-1" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();

    // Error message should not be visible initially
    expect(screen.queryByText("Syntax error in policy rule")).not.toBeInTheDocument();

    // Click to expand error
    await user.click(screen.getByText("Failed"));
    expect(screen.getByText("Syntax error in policy rule")).toBeInTheDocument();
  });

  it("uses initialStatus when hook returns no data", () => {
    mockUseCompilationStatus.mockReturnValue({
      data: undefined,
    });

    render(<CompilationStatus policyId="pol-1" initialStatus="compiling" />);

    expect(screen.getByText("Compiling")).toBeInTheDocument();
  });
});
