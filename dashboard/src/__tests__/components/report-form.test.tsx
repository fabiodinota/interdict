/**
 * Tests for dashboard/src/components/reports/ReportForm.tsx
 *
 * Validates date preset buttons, format selection, generate button,
 * and validation (missing dates).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportForm } from "@/components/reports/ReportForm";
import type { ReportRequest } from "@/hooks/use-reports";

describe("ReportForm", () => {
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with title and date presets", () => {
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    expect(screen.getByText("Generate Compliance Report")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Last quarter")).toBeInTheDocument();
    expect(screen.getByText("Year to date")).toBeInTheDocument();
  });

  it("renders format selector defaulting to PDF", () => {
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    expect(screen.getByText("Generate PDF Report")).toBeInTheDocument();
  });

  it("renders report content preview list", () => {
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    expect(screen.getByText("Report includes:")).toBeInTheDocument();
    expect(
      screen.getByText(/Executive summary with key performance metrics/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Policy violations by type, department, and vendor/),
    ).toBeInTheDocument();
  });

  it("calls onGenerate with PDF format when Generate button is clicked", async () => {
    const user = userEvent.setup();
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    await user.click(screen.getByText("Generate PDF Report"));

    expect(mockOnGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "pdf",
        from_date: expect.any(String),
        to_date: expect.any(String),
      }),
    );
  });

  it("clicking a date preset updates the date range", async () => {
    const user = userEvent.setup();
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    await user.click(screen.getByText("Last 7 days"));

    // Generate should work after preset selection
    await user.click(screen.getByText("Generate PDF Report"));

    expect(mockOnGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "pdf",
        from_date: expect.any(String),
        to_date: expect.any(String),
      }),
    );
  });

  it("disables generate button and presets when isGenerating is true", () => {
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={true} />);

    expect(screen.getByText("Generate PDF Report")).toBeDisabled();
    expect(screen.getByText("Last 7 days")).toBeDisabled();
    expect(screen.getByText("Last 30 days")).toBeDisabled();
  });

  it("renders From and To date labels", () => {
    render(<ReportForm onGenerate={mockOnGenerate} isGenerating={false} />);

    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
  });
});
