/**
 * Tests for dashboard/src/components/audit/AuditFilters.tsx
 *
 * Multi-filter form with vendor/department/action selects, date pickers, apply/clear.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { AuditFilters } from "@/components/audit/AuditFilters";
import type { AuditFilters as AuditFiltersType } from "@/hooks/use-audit";

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock vendor options hook
vi.mock("@/hooks/use-audit", async () => {
  const actual = await vi.importActual("@/hooks/use-audit");
  return {
    ...actual,
    useVendorOptions: () => ({
      data: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic" },
      ],
    }),
  };
});

// Mock radix Select — radix portals don't work in happy-dom
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {typeof children === "function" ? children() : children}
      <button data-testid="select-trigger" onClick={() => onValueChange?.("block")}>
        trigger
      </button>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

// Mock Calendar/Popover to avoid complex radix popovers
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: () => <div data-testid="calendar">Calendar</div>,
}));

describe("AuditFilters", () => {
  const defaultFilters: AuditFiltersType = {};
  let onFiltersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onFiltersChange = vi.fn();
  });

  it("renders filter labels", () => {
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("renders Apply Filters button", () => {
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    expect(screen.getByText("Apply Filters")).toBeInTheDocument();
  });

  it("renders date presets", () => {
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("calls onFiltersChange when Apply Filters is clicked", async () => {
    const user = userEvent.setup();
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    await user.click(screen.getByText("Apply Filters"));
    expect(onFiltersChange).toHaveBeenCalled();
  });

  it("shows clear button when filters are active and clears on click", async () => {
    const user = userEvent.setup();
    const activeFilters: AuditFiltersType = { vendor: "openai", department: "eng" };

    render(<AuditFilters filters={activeFilters} onFiltersChange={onFiltersChange} />);

    const clearButton = screen.getByTitle("Clear filters");
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);
    expect(onFiltersChange).toHaveBeenCalledWith({});
    expect(mockReplace).toHaveBeenCalledWith("/audit", { scroll: false });
  });

  it("does not show clear button when no filters are active", () => {
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    expect(screen.queryByTitle("Clear filters")).not.toBeInTheDocument();
  });

  it("renders department input that accepts text", async () => {
    const user = userEvent.setup();
    render(<AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    const input = screen.getByPlaceholderText("Filter by department...");
    await user.type(input, "engineering");
    expect(input).toHaveValue("engineering");
  });

  it("has no axe-core accessibility violations", async () => {
    const { container } = render(
      <AuditFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />,
    );

    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
