"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Search, ShieldCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuditRecord, AuditSearchResponse } from "@/hooks/use-audit";
import { useVerifyBundles } from "@/hooks/use-evidence";
import { BundleDetailPanel } from "@/components/evidence/BundleDetailPanel";
import type { VerificationResult, EvidenceBundle } from "@/types/api";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<AuditRecord>();

// ---------------------------------------------------------------------------
// QuickVerifyButton -- inline verification for a single audit row
// ---------------------------------------------------------------------------

function QuickVerifyButton({ record }: { record: AuditRecord }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const verifyMutation = useVerifyBundles();

  const handleVerify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await verifyMutation.mutateAsync([record.bundle_id]);
      if (response.data && response.data.length > 0) {
        setResult(response.data[0]);
        setOpen(true);
      }
    } catch {
      // Error handled by mutation state
    }
  };

  // Construct partial bundle from audit record for display in detail panel.
  // Full cryptographic fields are fetched server-side by the verify API.
  const bundle: EvidenceBundle = {
    bundle_id: record.bundle_id,
    chain_hash: record.chain_hash,
    previous_hash: "",
    sequence_number: 0,
    signature: "",
    signing_key_id: "",
    timestamp: record.timestamp,
    actor_identity: record.actor_identity,
    vendor: record.vendor,
    policy_action: record.policy_action,
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={handleVerify}
        disabled={verifyMutation.isPending}
      >
        {verifyMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
      </Button>
      <BundleDetailPanel
        open={open}
        onOpenChange={setOpen}
        bundle={bundle}
        verificationResult={result}
      />
    </>
  );
}

function actionBadgeClass(action: string) {
  switch (action) {
    case "allow":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    case "block":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    case "redact":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800";
    default:
      return "";
  }
}

const columns = [
  columnHelper.accessor("timestamp", {
    header: "Timestamp",
    cell: (info) => {
      try {
        return format(parseISO(info.getValue()), "MMM d, yyyy HH:mm:ss");
      } catch {
        return info.getValue();
      }
    },
  }),
  columnHelper.accessor(
    (row) => row.actor_display_name || row.actor_identity,
    {
      id: "actor",
      header: "Actor",
      cell: (info) => {
        const full = info.getValue();
        const truncated = full && full.length > 24 ? `${full.slice(0, 24)}...` : full;
        if (full && full.length > 24) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">{truncated}</span>
                </TooltipTrigger>
                <TooltipContent>{full}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        return <span>{full || "Unknown"}</span>;
      },
    }
  ),
  columnHelper.accessor(
    (row) => row.department_display_name || row.department,
    {
      id: "department",
      header: "Department",
      cell: (info) => <span>{info.getValue() || "-"}</span>,
    }
  ),
  columnHelper.accessor("vendor", {
    header: "Vendor",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div>
          <div>{row.vendor_display_name || row.vendor}</div>
          {row.model && (
            <div className="text-xs text-muted-foreground">{row.model}</div>
          )}
        </div>
      );
    },
  }),
  columnHelper.accessor("policy_action", {
    header: "Action",
    cell: (info) => {
      const action = info.getValue();
      return (
        <Badge variant="outline" className={actionBadgeClass(action)}>
          {action}
        </Badge>
      );
    },
  }),
  columnHelper.accessor("token_count", {
    header: "Tokens",
    cell: (info) => {
      const val = info.getValue();
      return val != null ? val.toLocaleString() : "-";
    },
  }),
  columnHelper.accessor("enforcement_latency_us", {
    header: "Latency",
    cell: (info) => {
      const us = info.getValue();
      if (us == null) return "-";
      return `${(us / 1000).toFixed(1)}ms`;
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Verify",
    cell: (info) => <QuickVerifyButton record={info.row.original} />,
  }),
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AuditTableProps {
  data: AuditSearchResponse | undefined;
  isLoading: boolean;
  cursors: string[];
  onNextPage: (cursor: string) => void;
  onPreviousPage: () => void;
}

export function AuditTable({
  data,
  isLoading,
  cursors,
  onNextPage,
  onPreviousPage,
}: AuditTableProps) {
  const records = data?.data ?? [];
  const hasMore = data?.pagination?.hasMore ?? false;
  const nextCursor = data?.pagination?.nextCursor ?? null;

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  // Loading skeleton
  if (isLoading && records.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Empty state
  if (!isLoading && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Search className="size-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium">No audit records found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No audit records found matching your filters. Try adjusting the search
          criteria or date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {cursors.length + 1}
          {records.length > 0 && ` (${records.length} records)`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={onPreviousPage}
          >
            <ChevronLeft className="size-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || !nextCursor}
            onClick={() => nextCursor && onNextPage(nextCursor)}
          >
            Next
            <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
