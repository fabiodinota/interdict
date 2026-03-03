"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSigningKeys, useRotateKey } from "@/hooks/use-signing-keys";
import { SigningKeyTable } from "@/components/signing-keys/SigningKeyTable";
import { RotateKeyDialog } from "@/components/signing-keys/RotateKeyDialog";

export default function SigningKeysPage() {
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const { data, isLoading, isError, error } = useSigningKeys();
  const rotateMutation = useRotateKey();

  const keys = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Signing Keys</h1>
        </div>
        <p className="text-muted-foreground">
          Manage Ed25519 signing keys used for evidence bundle integrity. Rotate
          keys periodically -- retired keys remain valid for historical
          verification.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setShowRotateDialog(true)}>Rotate Key</Button>
      </div>

      {/* Content */}
      {isLoading && (
        <p className="text-sm text-muted-foreground">
          Loading signing keys...
        </p>
      )}

      {isError && (
        <p className="text-sm text-red-600">
          Failed to load signing keys: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            {keys.length} key(s)
          </p>
          <SigningKeyTable keys={keys} />
        </>
      )}

      {/* Rotate dialog */}
      <RotateKeyDialog
        open={showRotateDialog}
        onOpenChange={setShowRotateDialog}
        isPending={rotateMutation.isPending}
        onConfirm={() =>
          rotateMutation.mutate(undefined, {
            onSuccess: () => setShowRotateDialog(false),
          })
        }
      />
    </div>
  );
}
