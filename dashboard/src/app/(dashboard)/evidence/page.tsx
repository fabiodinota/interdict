"use client";

import { useState, useCallback } from "react";
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Evidence Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify evidence bundle integrity through cryptographic checks:
          hash chain recomputation, Ed25519 signature validation, and
          Merkle anchor verification (via CLI).
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
