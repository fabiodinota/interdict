"use client";

import { Clock, Check, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCompilationStatus } from "@/hooks/use-compilation-status";
import { useState } from "react";

interface CompilationStatusProps {
  policyId: string;
  enabled?: boolean;
  /** Optional initial status to display before polling starts */
  initialStatus?: "pending" | "compiling" | "compiled" | "failed";
}

export function CompilationStatus({
  policyId,
  enabled = true,
  initialStatus,
}: CompilationStatusProps) {
  const [showError, setShowError] = useState(false);
  const { data } = useCompilationStatus(policyId, enabled);

  const status = data?.data?.status ?? initialStatus ?? "pending";
  const error = data?.data?.error;
  const wasmHash = data?.data?.wasmHash;
  const wasmSize = data?.data?.wasmSize;

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => status === "failed" && setShowError(!showError)}
        className="cursor-default"
      >
        {status === "pending" && (
          <Badge variant="secondary" className="gap-1 text-muted-foreground">
            <Clock className="size-3" />
            Pending
          </Badge>
        )}
        {status === "compiling" && (
          <Badge variant="secondary" className="gap-1 text-blue-600 dark:text-blue-400">
            <Loader2 className="size-3 animate-spin" />
            Compiling
          </Badge>
        )}
        {status === "compiled" && (
          <Badge variant="secondary" className="gap-1 text-green-600 dark:text-green-400">
            <Check className="size-3" />
            Compiled
          </Badge>
        )}
        {status === "failed" && (
          <Badge
            variant="destructive"
            className="gap-1 cursor-pointer"
          >
            <X className="size-3" />
            Failed
          </Badge>
        )}
      </button>

      {status === "compiled" && (wasmHash || wasmSize) && (
        <div className="text-xs text-muted-foreground pl-1">
          {wasmHash && (
            <span className="font-mono">{wasmHash.slice(0, 12)}...</span>
          )}
          {wasmSize && (
            <span className="ml-1">
              ({(wasmSize / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>
      )}

      {status === "failed" && showError && error && (
        <div className="mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
}
