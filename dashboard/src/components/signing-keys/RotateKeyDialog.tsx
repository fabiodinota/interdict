"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RotateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function RotateKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: RotateKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate Signing Key</DialogTitle>
          <DialogDescription>
            This will generate a new Ed25519 keypair and retire the current
            active key. Previously signed evidence bundles will remain
            verifiable.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? "Rotating..." : "Rotate Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
