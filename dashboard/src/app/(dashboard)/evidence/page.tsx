"use client";

import { useState, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { useEvidenceBundles } from "@/hooks/use-evidence";
import { BatchVerifyTable } from "@/components/evidence/BatchVerifyTable";

export default function EvidenceVerificationPage() {
  // Cursor stack pattern for forward/backward pagination
  const [cursors, setCursors] = useState<string[]>([]);
  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;

  const { data, isLoading } = useEvidenceBundles({}, currentCursor);

  const handleNextPage = useCallback(
    (cursor: string) => {
      setCursors((prev) => [...prev, cursor]);
    },
    []
  );

  const handlePreviousPage = useCallback(() => {
    setCursors((prev) => prev.slice(0, -1));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Evidence Verification
          </h1>
        </div>
        <p className="text-muted-foreground">
          Independently verify evidence bundle integrity through three
          cryptographic checks: hash chain linkage, Ed25519 signature
          validation, and Merkle proof inclusion.
        </p>
      </div>

      {/* Batch verify table with pagination */}
      <BatchVerifyTable
        data={data}
        isLoading={isLoading}
        cursors={cursors}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
      />
    </div>
  );
}
