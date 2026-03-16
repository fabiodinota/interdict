"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SlaTimer } from "./SlaTimer";
import { ReviewDialog } from "./ReviewDialog";
import { useReviewQueue, useClaimReview } from "@/hooks/use-reviews";
import type { ReviewItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Column helper
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<ReviewItem>();

// ---------------------------------------------------------------------------
// Risk score badge color
// ---------------------------------------------------------------------------

function riskBadgeVariant(score: number): "destructive" | "default" | "secondary" {
  if (score > 80) return "destructive";
  if (score > 50) return "default";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "outline",
    claimed: "default",
    approved: "secondary",
    rejected: "destructive",
    auto_escalated: "destructive",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// ReviewQueue
// ---------------------------------------------------------------------------

interface ReviewQueueProps {
  onStatsUpdate?: (stats: {
    pending: number;
    claimed: number;
    resolvedToday: number;
    expired: number;
  }) => void;
  currentUserId?: string;
}

export function ReviewQueue({ onStatsUpdate, currentUserId }: ReviewQueueProps) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [cursors, setCursors] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;

  const { data, isLoading } = useReviewQueue(statusFilter, currentCursor);
  const claimReview = useClaimReview();

  // Stabilize callback identity so the effect doesn't re-trigger on parent re-renders
  const onStatsUpdateRef = useRef(onStatsUpdate);
  onStatsUpdateRef.current = onStatsUpdate;

  // Propagate stats to parent via effect (not during render)
  useEffect(() => {
    if (data?.stats && onStatsUpdateRef.current) {
      onStatsUpdateRef.current(data.stats);
    }
  }, [data?.stats]);

  const handleNextPage = useCallback(
    (cursor: string) => setCursors((prev) => [...prev, cursor]),
    [],
  );

  const handlePreviousPage = useCallback(() => setCursors((prev) => prev.slice(0, -1)), []);

  const handleReview = useCallback(
    async (item: ReviewItem) => {
      if (item.status === "pending") {
        // Claim the item first
        try {
          const result = await claimReview.mutateAsync(item.id);
          if (result?.data) {
            setSelectedItem(result.data);
            setDialogOpen(true);
          }
        } catch {
          // Error toast handled by hook
        }
      } else if (item.status === "claimed" && item.claimedBy === currentUserId) {
        // Continue reviewing already-claimed item
        setSelectedItem(item);
        setDialogOpen(true);
      }
    },
    [claimReview, currentUserId],
  );

  const handleFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setCursors([]);
  }, []);

  // Table columns
  const columns = useMemo(
    () => [
      columnHelper.accessor("slaDeadline", {
        header: "SLA",
        cell: (info) => <SlaTimer deadline={info.getValue()} />,
      }),
      columnHelper.accessor("bundleId", {
        header: "Bundle ID",
        cell: (info) => (
          <span className="font-mono text-xs truncate max-w-[120px] inline-block">
            {info.getValue()?.substring(0, 12)}...
          </span>
        ),
      }),
      columnHelper.accessor("actorIdentity", {
        header: "Actor",
        cell: (info) => (
          <span className="text-sm truncate max-w-[150px] inline-block">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("vendor", {
        header: "Vendor",
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor("riskScore", {
        header: "Risk",
        cell: (info) => (
          <Badge variant={riskBadgeVariant(info.getValue())}>{info.getValue()}</Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => statusBadge(info.getValue()),
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const item = info.row.original;
          if (item.status === "pending") {
            return (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleReview(item)}
                disabled={claimReview.isPending}
              >
                {claimReview.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Review
              </Button>
            );
          }
          if (item.status === "claimed" && item.claimedBy === currentUserId) {
            return (
              <Button size="sm" variant="outline" onClick={() => handleReview(item)}>
                Continue Review
              </Button>
            );
          }
          if (item.status === "claimed") {
            return (
              <Button size="sm" variant="ghost" disabled>
                Claimed
              </Button>
            );
          }
          return null;
        },
      }),
    ],
    [handleReview, claimReview.isPending, currentUserId],
  );

  const items = data?.data ?? [];

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages row-model state internally; this component uses the table instance locally and does not memoize or pass it across boundaries.
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <Tabs value={statusFilter} onValueChange={handleFilterChange} className="w-auto">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="claimed">Claimed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No review items found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousPage}
          disabled={cursors.length === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => data?.pagination?.nextCursor && handleNextPage(data.pagination.nextCursor)}
          disabled={!data?.pagination?.nextCursor}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Review dialog */}
      <ReviewDialog item={selectedItem} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
