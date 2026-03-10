/**
 * Tests for dashboard/src/components/evidence/VerificationStepper.tsx
 *
 * Validates that operator-visible verification states (pass, fail, partial)
 * are rendered correctly. This is the core trust surface — if verification
 * results display incorrectly, operators make wrong decisions.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationStepper } from "@/components/evidence/VerificationStepper";
import type { VerificationResult } from "@/types/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PASS_RESULT: VerificationResult = {
  bundleId: "bundle-pass-001",
  overall: "pass",
  steps: [
    {
      name: "Signature Verification",
      passed: true,
      details: { algorithm: "Ed25519", key_id: "k1" },
    },
    {
      name: "Chain Hash Continuity",
      passed: true,
      details: { chain_valid: "true" },
    },
  ],
};

const FAIL_RESULT: VerificationResult = {
  bundleId: "bundle-fail-001",
  overall: "fail",
  steps: [
    {
      name: "Signature Verification",
      passed: false,
      details: { error: "Invalid signature bytes" },
    },
    {
      name: "Chain Hash Continuity",
      passed: true,
      details: {},
    },
  ],
};

const PARTIAL_RESULT: VerificationResult = {
  bundleId: "bundle-partial-001",
  overall: "partial",
  steps: [
    {
      name: "Signature Verification",
      passed: true,
      details: {},
    },
    {
      name: "Chain Hash Continuity",
      passed: null,
      details: { reason: "No previous bundle in chain" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VerificationStepper", () => {
  describe("overall banner", () => {
    it("shows 'All checks passed' for pass result", () => {
      render(<VerificationStepper result={PASS_RESULT} />);
      expect(screen.getByText("All checks passed")).toBeInTheDocument();
    });

    it("shows 'Verification failed' for fail result", () => {
      render(<VerificationStepper result={FAIL_RESULT} />);
      expect(screen.getByText("Verification failed")).toBeInTheDocument();
    });

    it("shows 'Partial verification' for partial result", () => {
      render(<VerificationStepper result={PARTIAL_RESULT} />);
      expect(screen.getByText("Partial verification")).toBeInTheDocument();
    });
  });

  describe("step rendering", () => {
    it("renders all step names", () => {
      render(<VerificationStepper result={PASS_RESULT} />);

      expect(screen.getByText("Signature Verification")).toBeInTheDocument();
      expect(screen.getByText("Chain Hash Continuity")).toBeInTheDocument();
    });

    it("renders Pass badge for passed steps", () => {
      render(<VerificationStepper result={PASS_RESULT} />);

      const passBadges = screen.getAllByText("Pass");
      expect(passBadges).toHaveLength(2);
    });

    it("renders Fail badge for failed steps", () => {
      render(<VerificationStepper result={FAIL_RESULT} />);

      expect(screen.getByText("Fail")).toBeInTheDocument();
    });

    it("renders N/A badge for null (indeterminate) steps", () => {
      render(<VerificationStepper result={PARTIAL_RESULT} />);

      expect(screen.getByText("N/A")).toBeInTheDocument();
    });
  });

  describe("step expansion", () => {
    it("expands step details on click", async () => {
      const user = userEvent.setup();
      render(<VerificationStepper result={PASS_RESULT} />);

      // Details should not be visible initially
      expect(screen.queryByText(/algorithm: Ed25519/)).not.toBeInTheDocument();

      // Click the first step
      await user.click(screen.getByText("Signature Verification"));

      // Details should now be visible
      expect(screen.getByText(/algorithm: Ed25519/)).toBeInTheDocument();
      expect(screen.getByText(/key_id: k1/)).toBeInTheDocument();
    });

    it("shows all steps expanded when defaultExpanded is true", () => {
      render(<VerificationStepper result={PASS_RESULT} defaultExpanded />);

      expect(screen.getByText(/algorithm: Ed25519/)).toBeInTheDocument();
      expect(screen.getByText(/chain_valid: true/)).toBeInTheDocument();
    });

    it("collapses step on second click", async () => {
      const user = userEvent.setup();
      render(<VerificationStepper result={PASS_RESULT} />);

      const stepButton = screen.getByText("Signature Verification");
      await user.click(stepButton);
      expect(screen.getByText(/algorithm: Ed25519/)).toBeInTheDocument();

      await user.click(stepButton);
      expect(screen.queryByText(/algorithm: Ed25519/)).not.toBeInTheDocument();
    });
  });

  describe("error details", () => {
    it("shows error details for failed steps when expanded", async () => {
      const user = userEvent.setup();
      render(<VerificationStepper result={FAIL_RESULT} />);

      await user.click(screen.getByText("Signature Verification"));
      expect(screen.getByText(/error: Invalid signature bytes/)).toBeInTheDocument();
    });
  });
});
