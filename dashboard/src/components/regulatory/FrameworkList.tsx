"use client";

import { Scale } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FrameworkCard } from "@/components/regulatory/FrameworkCard";
import { useFrameworks } from "@/hooks/use-regulatory";
import type { FrameworkSummary } from "@/hooks/use-regulatory";

interface FrameworkListProps {
  onSelectFramework: (slug: string) => void;
}

export function FrameworkList({ onSelectFramework }: FrameworkListProps) {
  const { data, isLoading } = useFrameworks();

  const frameworks: FrameworkSummary[] = data?.data ?? [];

  // Group by jurisdiction
  const grouped = frameworks.reduce<Record<string, FrameworkSummary[]>>((acc, fw) => {
    const key = fw.jurisdiction ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(fw);
    return acc;
  }, {});

  const jurisdictions = Object.keys(grouped).sort();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (frameworks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Scale className="size-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium">No regulatory frameworks available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Regulatory frameworks will appear here once configured.
        </p>
      </div>
    );
  }

  // If only one jurisdiction or no meaningful grouping, show flat grid
  if (jurisdictions.length <= 1) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {frameworks.map((fw) => (
          <FrameworkCard key={fw.id} framework={fw} onSelect={onSelectFramework} />
        ))}
      </div>
    );
  }

  // Multiple jurisdictions - group
  return (
    <div className="space-y-6">
      {jurisdictions.map((jurisdiction) => (
        <div key={jurisdiction}>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">{jurisdiction}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {grouped[jurisdiction].map((fw) => (
              <FrameworkCard key={fw.id} framework={fw} onSelect={onSelectFramework} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
