"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CompilationStatus } from "@/components/policies/CompilationStatus";
import { PolicyVersionHistory } from "@/components/policies/PolicyVersionHistory";
import { useUpdatePolicy, useDeletePolicy } from "@/hooks/use-policies";
import type { Policy } from "@/types/api";

interface PolicyRowProps {
  policy: Policy;
}

export function PolicyRow({ policy }: PolicyRowProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();

  function handleToggleActive(checked: boolean) {
    updatePolicy.mutate({
      id: policy.id,
      enabled: checked,
    });
  }

  function handleDelete() {
    deletePolicy.mutate(policy.id);
    setShowDeleteConfirm(false);
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="shrink-0 p-0.5 hover:bg-muted rounded"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="text-sm font-medium text-left hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {policy.name}
          </button>
          {policy.description && (
            <p className="text-xs text-muted-foreground truncate max-w-md">
              {policy.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <CompilationStatus policyId={policy.id} />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {policy.is_active ? "Active" : "Inactive"}
            </span>
            <Switch
              size="sm"
              checked={policy.is_active}
              onCheckedChange={handleToggleActive}
              disabled={updatePolicy.isPending}
            />
          </div>

          <span className="text-xs text-muted-foreground hidden sm:inline">
            {format(new Date(policy.created_at), "MMM d, yyyy")}
          </span>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => router.push(`/policies/new?edit=${policy.id}`)}
            aria-label="Edit policy"
          >
            <Pencil className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete policy"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Expanded version history */}
      {expanded && (
        <div className="border-t">
          <PolicyVersionHistory
            policyId={policy.id}
            currentRegoSource={policy.current_version?.rego_source ?? ""}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{policy.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePolicy.isPending}
            >
              {deletePolicy.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
