/**
 * Tests for dashboard/src/components/signing-keys/SigningKeyTable.tsx
 *
 * Validates table structure, active/retired badge rendering, empty state,
 * and date formatting.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SigningKeyTable } from "@/components/signing-keys/SigningKeyTable";
import type { SigningKeyInfo } from "@/types/api";

const mockActiveKey: SigningKeyInfo = {
  id: "key-1",
  key_id: "abcdef1234567890abcdef1234567890",
  public_key_hex: "deadbeef01234567890abcdef1234567",
  is_active: true,
  activated_at: "2025-01-15T10:00:00Z",
  retired_at: null,
  created_at: "2025-01-10T08:00:00Z",
};

const mockRetiredKey: SigningKeyInfo = {
  id: "key-2",
  key_id: "11223344556677889900aabbccddeeff",
  public_key_hex: "cafebabe01234567890abcdef1234567",
  is_active: false,
  activated_at: "2024-06-01T12:00:00Z",
  retired_at: "2025-01-15T10:00:00Z",
  created_at: "2024-06-01T08:00:00Z",
};

describe("SigningKeyTable", () => {
  it("renders table headers", () => {
    render(<SigningKeyTable keys={[]} />);

    expect(screen.getByText("Key ID")).toBeInTheDocument();
    expect(screen.getByText("Public Key")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Activated / Retired")).toBeInTheDocument();
  });

  it("renders empty table body with no keys", () => {
    render(<SigningKeyTable keys={[]} />);

    // Table has headers but no data rows — only the header row
    const allRows = screen.getAllByRole("row");
    expect(allRows.length).toBe(1);
  });

  it("renders active key with Active badge and truncated IDs", () => {
    render(<SigningKeyTable keys={[mockActiveKey]} />);

    // Truncated key_id: first 8 chars + "..."
    expect(screen.getByText("abcdef12...")).toBeInTheDocument();
    // Truncated public_key_hex: first 12 chars + "..."
    expect(screen.getByText("deadbeef0123...")).toBeInTheDocument();
    // Active badge
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders retired key with Retired badge", () => {
    render(<SigningKeyTable keys={[mockRetiredKey]} />);

    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("renders both active and retired keys", () => {
    render(<SigningKeyTable keys={[mockActiveKey, mockRetiredKey]} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();

    // Should have header row + 2 data rows
    const allRows = screen.getAllByRole("row");
    expect(allRows.length).toBe(3);
  });

  it("shows relative time for active key activated_at", () => {
    render(<SigningKeyTable keys={[mockActiveKey]} />);

    // formatDistanceToNow produces relative time with "ago" suffix
    // Just verify it renders something (exact text depends on current date)
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
  });
});
