"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { VerificationStepper } from "./VerificationStepper";
import type { EvidenceBundle, VerificationResult } from "@/types/api";

// ---------------------------------------------------------------------------
// Copyable monospace block
// ---------------------------------------------------------------------------

function MonoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-all select-all">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BundleDetailPanel
// ---------------------------------------------------------------------------

interface BundleDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle?: EvidenceBundle | null;
  verificationResult?: VerificationResult | null;
}

export function BundleDetailPanel({
  open,
  onOpenChange,
  bundle,
  verificationResult,
}: BundleDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bundle Details</SheetTitle>
          <SheetDescription>
            {bundle ? `Bundle ${bundle.bundle_id.substring(0, 12)}...` : "No bundle selected"}
          </SheetDescription>
        </SheetHeader>

        {bundle && (
          <div className="mt-6 space-y-6">
            {/* Metadata */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Metadata</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Bundle ID</p>
                  <p className="font-mono text-xs break-all">{bundle.bundle_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="text-xs">{bundle.timestamp}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actor</p>
                  <p className="text-xs">{bundle.actor_identity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="text-xs">{bundle.vendor}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Policy Action</p>
                  <p className="text-xs">{bundle.policy_action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sequence</p>
                  <p className="text-xs">{bundle.sequence_number}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Verification results */}
            {verificationResult && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Verification</h4>
                <VerificationStepper result={verificationResult} defaultExpanded />
              </div>
            )}

            <Separator />

            {/* Raw cryptographic data */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Raw Cryptographic Data</h4>
              <div className="space-y-3">
                <MonoField label="Chain Hash" value={bundle.chain_hash} />
                <MonoField label="Previous Hash" value={bundle.previous_hash} />
                <MonoField label="Signature" value={bundle.signature} />
                <MonoField label="Signing Key ID" value={bundle.signing_key_id} />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
