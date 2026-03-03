"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PolicyRow } from "@/components/policies/PolicyRow";
import { usePolicies } from "@/hooks/use-policies";

export function PolicyList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const currentCursor = cursors.length > 0 ? cursors[cursors.length - 1] : undefined;
  const { data, isLoading } = usePolicies(currentCursor);

  const policies = data?.data?.items ?? [];
  const nextCursor = data?.data?.nextCursor ?? null;

  // Client-side filter by name
  const filteredPolicies = searchQuery
    ? policies.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : policies;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search policies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button asChild>
          <Link href="/policies/new">
            <Plus className="size-4" />
            Create New Policy
          </Link>
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-4" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && policies.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FileText className="size-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No policies yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create your first policy to get started.
          </p>
          <Button asChild>
            <Link href="/policies/new">
              <Plus className="size-4" />
              Create New Policy
            </Link>
          </Button>
        </div>
      )}

      {/* Policy rows */}
      {!isLoading && filteredPolicies.length > 0 && (
        <div className="space-y-2">
          {filteredPolicies.map((policy) => (
            <PolicyRow key={policy.id} policy={policy} />
          ))}
        </div>
      )}

      {/* No search results */}
      {!isLoading &&
        policies.length > 0 &&
        filteredPolicies.length === 0 &&
        searchQuery && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No policies matching &quot;{searchQuery}&quot;
          </div>
        )}

      {/* Pagination */}
      {!isLoading && nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setCursors([...cursors, nextCursor])}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
