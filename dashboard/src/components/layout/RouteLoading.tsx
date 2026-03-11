import { Skeleton } from "@/components/ui/skeleton";

export function RouteLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl border bg-card" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-xl border bg-card" />
        <Skeleton className="h-80 rounded-xl border bg-card" />
      </div>
    </div>
  );
}
