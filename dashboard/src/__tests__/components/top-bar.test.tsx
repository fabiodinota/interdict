/**
 * Tests for dashboard/src/components/layout/TopBar.tsx
 *
 * Validates breadcrumb generation, user avatar/initials, auth state display,
 * and logout interaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "@/components/layout/TopBar";

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock ThemeToggle
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

// Mock auth hook
const mockLogout = vi.fn();
const mockUser = {
  id: "user-1",
  email: "alice@example.com",
  displayName: "Alice Smith",
  role: "department_manager",
  departmentIds: ["dept-1"],
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
    isLoading: false,
    isAuthenticated: true,
  }),
}));

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/");
  });

  it("renders Home breadcrumb on root route", () => {
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />);

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders breadcrumbs for nested route", () => {
    mockUsePathname.mockReturnValue("/policies/123");
    render(<TopBar />);

    expect(screen.getByText("Policies")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("uses ROUTE_LABELS for known routes in breadcrumbs", () => {
    mockUsePathname.mockReturnValue("/vendors");
    render(<TopBar />);

    expect(screen.getByText("Vendors")).toBeInTheDocument();
  });

  it("renders user initials from displayName", () => {
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />);

    // "Alice Smith" → "AS"
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("renders theme toggle", () => {
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />);

    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("shows user role badge in dropdown", async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />);

    // Click the avatar to open dropdown
    const avatarButton = screen.getByText("AS").closest("button")!;
    await user.click(avatarButton);

    // Should show user info
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Department Manager")).toBeInTheDocument();
  });

  it("calls logout when sign out is clicked", async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />);

    // Open dropdown
    const avatarButton = screen.getByText("AS").closest("button")!;
    await user.click(avatarButton);

    // Click sign out
    await user.click(screen.getByText("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
  });
});
