"use client";

import { useState } from "react";
import { Search, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorCard } from "@/components/vendors/VendorCard";
import { AddVendorDialog } from "@/components/vendors/AddVendorDialog";
import { useVendors } from "@/hooks/use-vendors";

export function VendorList() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading } = useVendors();

  const vendors = data?.data?.items ?? [];

  // Client-side filter by name/display_name
  const filteredVendors = searchQuery
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.display_name &&
            v.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : vendors;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <AddVendorDialog />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && vendors.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Store className="size-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No vendors registered</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Add your first AI vendor to start managing model access.
          </p>
          <AddVendorDialog />
        </div>
      )}

      {/* Vendor grid */}
      {!isLoading && filteredVendors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} />
          ))}
        </div>
      )}

      {/* No search results */}
      {!isLoading &&
        vendors.length > 0 &&
        filteredVendors.length === 0 &&
        searchQuery && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No vendors matching &quot;{searchQuery}&quot;
          </div>
        )}
    </div>
  );
}
