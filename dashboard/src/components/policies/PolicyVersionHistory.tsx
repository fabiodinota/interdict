"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePolicyVersions, useRestoreVersion } from "@/hooks/use-policies";

interface PolicyVersionHistoryProps {
  policyId: string;
  currentRegoSource: string;
}

// Simple line-by-line diff: green for additions, red for removals
function SimpleDiff({
  current,
  selected,
}: {
  current: string;
  selected: string;
}) {
  const currentLines = current.split("\n");
  const selectedLines = selected.split("\n");
  const maxLen = Math.max(currentLines.length, selectedLines.length);
  const diffLines: { type: "same" | "add" | "remove"; text: string }[] = [];

  for (let i = 0; i < maxLen; i++) {
    const curLine = i < currentLines.length ? currentLines[i] : undefined;
    const selLine = i < selectedLines.length ? selectedLines[i] : undefined;

    if (curLine === selLine) {
      diffLines.push({ type: "same", text: curLine ?? "" });
    } else {
      if (selLine !== undefined) {
        diffLines.push({ type: "remove", text: selLine });
      }
      if (curLine !== undefined) {
        diffLines.push({ type: "add", text: curLine });
      }
    }
  }

  return (
    <pre className="rounded-md bg-muted/50 p-3 text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={
            line.type === "add"
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : line.type === "remove"
                ? "bg-red-500/15 text-red-700 dark:text-red-400"
                : "text-muted-foreground"
          }
        >
          <span className="inline-block w-4 select-none opacity-60">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          {line.text}
        </div>
      ))}
    </pre>
  );
}

export function PolicyVersionHistory({
  policyId,
  currentRegoSource,
}: PolicyVersionHistoryProps) {
  const { data, isLoading } = usePolicyVersions(policyId);
  const restoreVersion = useRestoreVersion();
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<{
    versionId: string;
    version: number;
  } | null>(null);

  const versions = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No version history available.
      </div>
    );
  }

  const latestVersion = Math.max(...versions.map((v) => v.version));

  return (
    <div className="space-y-1 p-4">
      <h4 className="text-sm font-medium mb-2">Version History</h4>
      {versions.map((version) => {
        const isExpanded = expandedVersion === version.id;
        const isDiffShown = showDiff === version.id;
        const isCurrent = version.version === latestVersion;

        return (
          <div
            key={version.id}
            className="rounded-md border bg-card"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
              onClick={() =>
                setExpandedVersion(isExpanded ? null : version.id)
              }
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" />
              )}
              <span className="font-medium">v{version.version}</span>
              <span className="text-muted-foreground">
                {format(new Date(version.createdAt), "MMM d, yyyy HH:mm")}
              </span>
              {version.changeDescription && (
                <span className="text-muted-foreground truncate">
                  - {version.changeDescription}
                </span>
              )}
              {isCurrent && (
                <span className="ml-auto text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Current
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="border-t px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      setShowDiff(isDiffShown ? null : version.id)
                    }
                  >
                    {isDiffShown ? "Hide Diff" : "View Diff"}
                  </Button>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        setConfirmRestore({
                          versionId: version.id,
                          version: version.version,
                        })
                      }
                    >
                      <RotateCcw className="size-3" />
                      Restore
                    </Button>
                  )}
                </div>

                {isDiffShown && (
                  <SimpleDiff
                    current={currentRegoSource}
                    selected={version.regoSource}
                  />
                )}

                {!isDiffShown && (
                  <pre className="rounded-md bg-muted/50 p-3 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto">
                    {version.regoSource}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Restore confirmation dialog */}
      <Dialog
        open={!!confirmRestore}
        onOpenChange={(open) => !open && setConfirmRestore(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version</DialogTitle>
            <DialogDescription>
              Are you sure you want to restore version {confirmRestore?.version}?
              This will create a new version with the restored content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRestore(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmRestore) {
                  restoreVersion.mutate({
                    policyId,
                    versionId: confirmRestore.versionId,
                  });
                  setConfirmRestore(null);
                }
              }}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
