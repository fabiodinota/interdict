"use client";

import { useState } from "react";
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signing Keys</h1>
        <p className="text-muted-foreground mt-1">
          Manage Ed25519 signing keys used for evidence bundle integrity. Rotate keys periodically
          -- retired keys remain valid for historical verification.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setShowRotateDialog(true)}>Rotate Key</Button>
      </div>

      {/* Content */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading signing keys...</p>}

      {isError && (
        <p className="text-sm text-red-600">
          Failed to load signing keys: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-muted-foreground">{keys.length} key(s)</p>
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
