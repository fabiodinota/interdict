"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuditFilters } from "@/components/audit/AuditFilters";
import { AuditTable } from "@/components/audit/AuditTable";
import { useAuditSearch } from "@/hooks/use-audit";
import type { AuditFilters as AuditFiltersType } from "@/hooks/use-audit";

function AuditPageContent() {
  const searchParams = useSearchParams();

  // Initialise filters from URL search params
  const [filters, setFilters] = useState<AuditFiltersType>(() => {
    const f: AuditFiltersType = {};
    const vendor = searchParams.get("vendor");
    const department = searchParams.get("department");
    const policyAction = searchParams.get("policy_action");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    if (vendor) f.vendor = vendor;
    if (department) f.department = department;
    if (policyAction) f.policy_action = policyAction;
    if (fromDate) f.from_date = fromDate;
    if (toDate) f.to_date = toDate;
    return f;
  });

  // Cursor stack for forward/backward pagination
  const [cursors, setCursors] = useState<string[]>([]);
  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;

  const { data, isLoading } = useAuditSearch(filters, currentCursor);

  const handleFiltersChange = useCallback((newFilters: AuditFiltersType) => {
    setFilters(newFilters);
    setCursors([]); // Reset pagination on filter change
  }, []);

  const handleNextPage = useCallback((cursor: string) => {
    setCursors((prev) => [...prev, cursor]);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setCursors((prev) => prev.slice(0, -1));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-muted-foreground mt-1">
          Search and filter AI interactions and policy decisions
        </p>
      </div>

      <AuditFilters filters={filters} onFiltersChange={handleFiltersChange} />

      <AuditTable
        data={data}
        isLoading={isLoading}
        cursors={cursors}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
      />
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditPageContent />
    </Suspense>
  );
}
