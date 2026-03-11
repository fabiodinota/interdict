"use client";

import { useMemo, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVerifyBundles } from "@/hooks/use-evidence";
import { BundleDetailPanel } from "./BundleDetailPanel";
import type { EvidenceBundle, VerificationResult } from "@/types/api";
import type { EvidenceBundlesResponse } from "@/hooks/use-evidence";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<EvidenceBundle>();

// ---------------------------------------------------------------------------
// BatchVerifyTable
// ---------------------------------------------------------------------------

interface BatchVerifyTableProps {
  data: EvidenceBundlesResponse | undefined;
  isLoading: boolean;
  cursors: string[];
  onNextPage: (cursor: string) => void;
  onPreviousPage: () => void;
}

export function BatchVerifyTable({
  data,
  isLoading,
  cursors,
  onNextPage,
  onPreviousPage,
}: BatchVerifyTableProps) {
  const bundles = data?.data ?? [];
  const hasMore = data?.pagination?.hasMore ?? false;
  const nextCursor = data?.pagination?.nextCursor ?? null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [verificationResults, setVerificationResults] = useState<Map<string, VerificationResult>>(
    new Map(),
  );
  const [detailBundle, setDetailBundle] = useState<EvidenceBundle | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const verifyMutation = useVerifyBundles();

  const toggleSelection = (bundleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) {
        next.delete(bundleId);
      } else {
        next.add(bundleId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === bundles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bundles.map((b) => b.bundle_id)));
    }
  };

  const handleVerifySelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const response = await verifyMutation.mutateAsync(ids);
    const newResults = new Map(verificationResults);
    for (const result of response.data) {
      newResults.set(result.bundleId, result);
    }
    setVerificationResults(newResults);
  };

  const openDetail = (bundle: EvidenceBundle) => {
    setDetailBundle(bundle);
    setDetailOpen(true);
  };

  function overallBadge(bundleId: string) {
    const result = verificationResults.get(bundleId);
    if (!result) return null;

    const config = {
      pass: {
        label: "Pass",
        className:
          "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400",
      },
      fail: {
        label: "Fail",
        className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400",
      },
      partial: {
        label: "Partial",
        className:
          "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400",
      },
    }[result.overall];

    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={bundles.length > 0 && selectedIds.size === bundles.length}
            onChange={toggleAll}
            className="rounded border-border"
          />
        ),
        cell: (info) => (
          <input
            type="checkbox"
            checked={selectedIds.has(info.row.original.bundle_id)}
            onChange={() => toggleSelection(info.row.original.bundle_id)}
            className="rounded border-border"
          />
        ),
      }),
      columnHelper.accessor("bundle_id", {
        header: "Bundle ID",
        cell: (info) => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openDetail(info.row.original)}
                  className="font-mono text-xs text-primary hover:underline cursor-pointer"
                >
                  {info.getValue().substring(0, 12)}...
                </button>
              </TooltipTrigger>
              <TooltipContent>{info.getValue()}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      }),
      columnHelper.accessor("timestamp", {
        header: "Timestamp",
        cell: (info) => {
          try {
            return format(parseISO(info.getValue()), "MMM d, HH:mm:ss");
          } catch {
            return info.getValue();
          }
        },
      }),
      columnHelper.accessor("actor_identity", {
        header: "Actor",
        cell: (info) => {
          const val = info.getValue();
          return val && val.length > 20 ? `${val.slice(0, 20)}...` : val;
        },
      }),
      columnHelper.accessor("vendor", {
        header: "Vendor",
      }),
      columnHelper.accessor("policy_action", {
        header: "Action",
        cell: (info) => {
          const action = info.getValue();
          const className =
            action === "block"
              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200"
              : action === "redact"
                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200"
                : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200";
          return (
            <Badge variant="outline" className={className}>
              {action}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "verification",
        header: "Verification",
        cell: (info) => overallBadge(info.row.original.bundle_id),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleAll and overallBadge are stable within the same render cycle
    [selectedIds, bundles, verificationResults],
  );

  const table = useReactTable({
    data: bundles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  // Loading skeleton
  if (isLoading && bundles.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 7 }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
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
  if (!isLoading && bundles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Search className="size-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium">No evidence bundles found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No evidence bundles found for the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={selectedIds.size === 0 || verifyMutation.isPending}
          onClick={handleVerifySelected}
        >
          {verifyMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Verify Selected ({selectedIds.size})
        </Button>
        {verifyMutation.isError && (
          <p className="text-sm text-destructive">
            Verification failed: {verifyMutation.error.message}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => openDetail(row.original)}
              >
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
          {bundles.length > 0 && ` (${bundles.length} bundles)`}
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

      {/* Detail panel */}
      <BundleDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        bundle={detailBundle}
        verificationResult={
          detailBundle ? (verificationResults.get(detailBundle.bundle_id) ?? null) : null
        }
      />
    </div>
  );
}
