"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameworkSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  jurisdiction: string | null;
  version: string | null;
  isSeeded: boolean;
  isActive: boolean;
  policyCount: number;
  activePolicyCount: number;
}

export interface FrameworkPolicy {
  id: string;
  policyId: string;
  policyName: string;
  requirementRef: string | null;
  requirementDescription: string | null;
  isRequired: boolean;
  sortOrder: number;
  compilationStatus: string | null;
}

export interface FrameworkDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  jurisdiction: string | null;
  version: string | null;
  isSeeded: boolean;
  isActive: boolean;
  policies: FrameworkPolicy[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** List all frameworks with activation status summary */
export function useFrameworks() {
  return useQuery<ApiResponse<FrameworkSummary[]>>({
    queryKey: ["frameworks"],
    queryFn: () =>
      api<ApiResponse<FrameworkSummary[]>>("/regulatory/frameworks"),
  });
}

/** Single framework with policies */
export function useFramework(slug: string) {
  return useQuery<ApiResponse<FrameworkDetail>>({
    queryKey: ["frameworks", slug],
    queryFn: () =>
      api<ApiResponse<FrameworkDetail>>(`/regulatory/frameworks/${slug}`),
    enabled: !!slug,
  });
}

/** Activate a framework */
export function useActivateFramework() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) =>
      api<ApiResponse<{ status: string }>>(`/regulatory/frameworks/${slug}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework activated");
    },
    onError: (error: Error) => {
      toast.error("Failed to activate framework", { description: error.message });
    },
  });
}

/** Deactivate a framework */
export function useDeactivateFramework() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) =>
      api<ApiResponse<{ status: string }>>(`/regulatory/frameworks/${slug}/deactivate`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework deactivated");
    },
    onError: (error: Error) => {
      toast.error("Failed to deactivate framework", { description: error.message });
    },
  });
}

/** Toggle individual framework policy */
export function useToggleFrameworkPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      slug,
      policyId,
      isRequired,
    }: {
      slug: string;
      policyId: string;
      isRequired: boolean;
    }) =>
      api<ApiResponse<{ id: string; isRequired: boolean }>>(
        `/regulatory/frameworks/${slug}/policies/${policyId}/toggle`,
        {
          method: "PUT",
          body: JSON.stringify({ isRequired }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Policy toggle updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to toggle policy", { description: error.message });
    },
  });
}
