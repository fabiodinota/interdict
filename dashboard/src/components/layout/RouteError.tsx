"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function RouteError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[dashboard] route segment failed", error);
    } else {
      console.error("[dashboard] route segment failed");
    }
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Dashboard Error
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">
          This workspace view failed to load.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {error.message || "An unexpected error interrupted the dashboard."}
        </p>
        <Button type="button" onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
