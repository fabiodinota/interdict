"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Policy, PolicyVersion, PaginatedResponse, ApiResponse } from "@/types/api";

// Fetch paginated policy list
export function usePolicies(cursor?: string) {
  return useQuery<PaginatedResponse<Policy>>({
    queryKey: ["policies", cursor],
    queryFn: () => {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return api<PaginatedResponse<Policy>>(`/policies${params}`);
    },
  });
}

// Fetch single policy
export function usePolicy(id: string) {
  return useQuery<ApiResponse<Policy>>({
    queryKey: ["policies", id],
    queryFn: () => api<ApiResponse<Policy>>(`/policies/${id}`),
    enabled: !!id,
  });
}

// Create a new policy
export function useCreatePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      rego_source: string;
      entrypoint: string;
    }) =>
      api<ApiResponse<Policy>>("/policies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy created successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 400) {
        toast.error("Invalid Rego syntax", {
          description: error.message,
        });
      } else {
        toast.error("Failed to create policy", {
          description: error.message,
        });
      }
    },
  });
}

// Update an existing policy
export function useUpdatePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      rego_source?: string;
      entrypoint?: string;
      enabled?: boolean;
      change_description?: string;
    }) =>
      api<ApiResponse<Policy>>(`/policies/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy updated successfully");
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 400) {
        toast.error("Invalid Rego syntax", {
          description: error.message,
        });
      } else {
        toast.error("Failed to update policy", {
          description: error.message,
        });
      }
    },
  });
}

// Soft-delete a policy
export function useDeletePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api<ApiResponse<null>>(`/policies/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete policy", {
        description: error.message,
      });
    },
  });
}

// Fetch policy version history
export function usePolicyVersions(policyId: string) {
  return useQuery<ApiResponse<PolicyVersion[]>>({
    queryKey: ["policies", policyId, "versions"],
    queryFn: () => api<ApiResponse<PolicyVersion[]>>(`/policies/${policyId}/versions`),
    enabled: !!policyId,
  });
}

// Restore a previous version
export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ policyId, versionId }: { policyId: string; versionId: string }) =>
      api<ApiResponse<Policy>>(`/policies/${policyId}/restore/${versionId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Version restored successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to restore version", {
        description: error.message,
      });
    },
  });
}
