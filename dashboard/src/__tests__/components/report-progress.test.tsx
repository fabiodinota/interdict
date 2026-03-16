/**
 * Tests for dashboard/src/components/reports/ReportProgress.tsx
 *
 * Validates the three progress states (generating, success, error),
 * returns null when no state is active, and shows custom error messages.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportProgress } from "@/components/reports/ReportProgress";

describe("ReportProgress", () => {
  it("renders nothing when no state flags are set", () => {
    const { container } = render(
      <ReportProgress isGenerating={false} isSuccess={false} isError={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows generating state with spinner text", () => {
    render(<ReportProgress isGenerating={true} isSuccess={false} isError={false} />);

    expect(screen.getByText("Generating report...")).toBeInTheDocument();
    expect(screen.getByText(/Querying audit data and building the report/)).toBeInTheDocument();
  });

  it("shows success state with default download message", () => {
    render(<ReportProgress isGenerating={false} isSuccess={true} isError={false} />);

    expect(screen.getByText("Report ready!")).toBeInTheDocument();
    expect(screen.getByText("Your report has been downloaded.")).toBeInTheDocument();
  });

  it("shows success state with specific filename", () => {
    render(
      <ReportProgress
        isGenerating={false}
        isSuccess={true}
        isError={false}
        filename="audit-report-2025.csv"
      />,
    );

    expect(screen.getByText("Report ready!")).toBeInTheDocument();
    expect(screen.getByText(/Downloaded audit-report-2025\.csv/)).toBeInTheDocument();
  });

  it("shows error state with default error message", () => {
    render(<ReportProgress isGenerating={false} isSuccess={false} isError={true} />);

    expect(screen.getByText("Report generation failed")).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred. Please try again.")).toBeInTheDocument();
  });

  it("shows error state with custom error message", () => {
    render(
      <ReportProgress
        isGenerating={false}
        isSuccess={false}
        isError={true}
        errorMessage="Insufficient permissions for SOC2 report"
      />,
    );

    expect(screen.getByText("Report generation failed")).toBeInTheDocument();
    expect(screen.getByText("Insufficient permissions for SOC2 report")).toBeInTheDocument();
  });

  it("prioritizes generating state over success when both are true", () => {
    render(<ReportProgress isGenerating={true} isSuccess={true} isError={false} />);

    // The component renders generating first and success conditionally with !isGenerating
    expect(screen.getByText("Generating report...")).toBeInTheDocument();
    expect(screen.queryByText("Report ready!")).not.toBeInTheDocument();
  });
});
