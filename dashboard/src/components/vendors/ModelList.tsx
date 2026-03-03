"use client";

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useAddModel,
  useUpdateModel,
  useDeleteModel,
} from "@/hooks/use-vendors";
import type { VendorModel } from "@/hooks/use-vendors";

interface ModelListProps {
  vendorId: string;
  models: VendorModel[];
}

export function ModelList({ vendorId, models }: ModelListProps) {
  const [newModelName, setNewModelName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VendorModel | null>(null);

  const addModel = useAddModel();
  const updateModel = useUpdateModel();
  const deleteModel = useDeleteModel();

  const handleAddModel = () => {
    if (!newModelName.trim()) return;
    addModel.mutate(
      { vendorId, model_name: newModelName.trim(), status: "approved" },
      {
        onSuccess: () => {
          setNewModelName("");
          setShowAddForm(false);
        },
      }
    );
  };

  const handleToggleModel = (model: VendorModel) => {
    updateModel.mutate({
      vendorId,
      modelId: model.id,
      status: model.status === "approved" ? "blocked" : "approved",
    });
  };

  const handleDeleteModel = () => {
    if (!deleteTarget) return;
    deleteModel.mutate(
      { vendorId, modelId: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) }
    );
  };

  return (
    <div className="space-y-2 pt-3 border-t mt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Models ({models.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="size-3 mr-1" />
          Add
        </Button>
      </div>

      {/* Model list */}
      {models.map((model) => (
        <div
          key={model.id}
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{model.model_name}</span>
            <Badge
              variant="outline"
              className={
                model.status === "approved"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 text-xs"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs"
              }
            >
              {model.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={model.status === "approved"}
              onCheckedChange={() => handleToggleModel(model)}
              disabled={updateModel.isPending}
            />
            <Dialog
              open={deleteTarget?.id === model.id}
              onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setDeleteTarget(model)}
                >
                  <X className="size-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove Model</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove &quot;{model.model_name}
                    &quot;? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteModel}
                    disabled={deleteModel.isPending}
                  >
                    {deleteModel.isPending && (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    )}
                    Remove
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ))}

      {models.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground py-1">No models registered</p>
      )}

      {/* Add model form */}
      {showAddForm && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder="Model name (e.g. gpt-4o)"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleAddModel()}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={handleAddModel}
            disabled={addModel.isPending || !newModelName.trim()}
          >
            {addModel.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setShowAddForm(false);
              setNewModelName("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
