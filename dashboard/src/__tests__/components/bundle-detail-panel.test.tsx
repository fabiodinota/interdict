/**
 * Tests for dashboard/src/components/evidence/BundleDetailPanel.tsx
 *
 * Validates detail display for evidence bundles, empty/missing bundle state,
 * and open/close behavior of the Sheet panel.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BundleDetailPanel } from "@/components/evidence/BundleDetailPanel";
import type { EvidenceBundle, VerificationResult } from "@/types/api";

// Mock Sheet/Dialog primitives for JSDOM (radix portals don't work well in test)
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/evidence/VerificationStepper", () => ({
  VerificationStepper: ({ result }: { result: VerificationResult }) => (
    <div data-testid="verification-stepper">{result.overall}</div>
  ),
}));

const mockBundle: EvidenceBundle = {
  bundle_id: "bundle-abc123def456ghi789",
  chain_hash: "sha256:aabbccdd",
  previous_hash: "sha256:00112233",
  sequence_number: 42,
  signature: "sig:deadbeef",
  signing_key_id: "key-001",
  timestamp: "2025-06-01T12:00:00Z",
  actor_identity: "alice@corp.com",
  vendor: "openai",
  policy_action: "allow",
};

const mockVerification: VerificationResult = {
  bundleId: "bundle-abc123def456ghi789",
  steps: [
    { name: "Signature", passed: true, details: {} },
    { name: "Chain", passed: true, details: {} },
  ],
  overall: "pass",
};

describe("BundleDetailPanel", () => {
  const onOpenChange = vi.fn();

  it("renders nothing when closed", () => {
    const { container } = render(
      <BundleDetailPanel open={false} onOpenChange={onOpenChange} bundle={mockBundle} />,
    );
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("shows 'No bundle selected' when open with no bundle", () => {
    render(<BundleDetailPanel open={true} onOpenChange={onOpenChange} bundle={null} />);

    expect(screen.getByText("No bundle selected")).toBeInTheDocument();
    expect(screen.getByText("Bundle Details")).toBeInTheDocument();
  });

  it("displays bundle metadata when open with bundle data", () => {
    render(<BundleDetailPanel open={true} onOpenChange={onOpenChange} bundle={mockBundle} />);

    // Title truncated
    expect(screen.getByText(/bundle-abc123/)).toBeInTheDocument();
    // Metadata fields
    expect(screen.getByText("bundle-abc123def456ghi789")).toBeInTheDocument();
    expect(screen.getByText("alice@corp.com")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("allow")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("displays raw cryptographic data", () => {
    render(<BundleDetailPanel open={true} onOpenChange={onOpenChange} bundle={mockBundle} />);

    expect(screen.getByText("sha256:aabbccdd")).toBeInTheDocument();
    expect(screen.getByText("sha256:00112233")).toBeInTheDocument();
    expect(screen.getByText("sig:deadbeef")).toBeInTheDocument();
    expect(screen.getByText("key-001")).toBeInTheDocument();
  });

  it("renders verification stepper when verification result is provided", () => {
    render(
      <BundleDetailPanel
        open={true}
        onOpenChange={onOpenChange}
        bundle={mockBundle}
        verificationResult={mockVerification}
      />,
    );

    expect(screen.getByTestId("verification-stepper")).toBeInTheDocument();
    expect(screen.getByText("pass")).toBeInTheDocument();
  });

  it("omits verification section when no verification result", () => {
    render(<BundleDetailPanel open={true} onOpenChange={onOpenChange} bundle={mockBundle} />);

    expect(screen.queryByTestId("verification-stepper")).not.toBeInTheDocument();
  });
});
