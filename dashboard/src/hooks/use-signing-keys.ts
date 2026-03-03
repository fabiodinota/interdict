"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ApiResponse, SigningKeyInfo, RotateKeyResult } from "@/types/api";

/** Fetch all signing keys (active + retired) */
export function useSigningKeys() {
  return useQuery<ApiResponse<SigningKeyInfo[]>>({
    queryKey: ["signing-keys"],
    queryFn: () =>
      api<ApiResponse<SigningKeyInfo[]>>("/admin/signing-keys"),
  });
}

/** Rotate the active signing key (generates new Ed25519 keypair) */
export function useRotateKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<ApiResponse<RotateKeyResult>>("/admin/signing-keys/rotate", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signing-keys"] });
      toast.success("Signing key rotated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to rotate signing key", {
        description: error.message,
      });
    },
  });
}
