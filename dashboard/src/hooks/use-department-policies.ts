"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiResponse, DepartmentEffectivePolicy } from "@/types/api";

// ---------------------------------------------------------------------------
// Effective policies for a department
// ---------------------------------------------------------------------------

export function useEffectivePolicies(departmentId: string | undefined) {
  return useQuery<ApiResponse<DepartmentEffectivePolicy[]>>({
    queryKey: ["department-policies", "effective", departmentId],
    queryFn: () =>
      api<ApiResponse<DepartmentEffectivePolicy[]>>(
        `/department-overrides/effective/${departmentId}`,
      ),
    enabled: !!departmentId,
  });
}

// ---------------------------------------------------------------------------
// Set (create/update) an override
// ---------------------------------------------------------------------------

export function useSetOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { department_id: string; policy_id: string; enabled: boolean }) =>
      api<ApiResponse<{ id: string }>>("/department-overrides/override", {
        method: "PUT",
        body: JSON.stringify(params),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["department-policies", "effective", variables.department_id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Remove an override (revert to global)
// ---------------------------------------------------------------------------

export function useRemoveOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { overrideId: string; departmentId: string }) =>
      api<ApiResponse<{ deleted: boolean }>>(
        `/department-overrides/override/${params.overrideId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["department-policies", "effective", variables.departmentId],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggle mandatory flag (compliance_officer+)
// ---------------------------------------------------------------------------

export function useSetMandatory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { policyId: string; is_mandatory: boolean }) =>
      api<ApiResponse<{ updated: boolean }>>(`/department-overrides/mandatory/${params.policyId}`, {
        method: "PUT",
        body: JSON.stringify({ is_mandatory: params.is_mandatory }),
      }),
    onSuccess: () => {
      // Invalidate all effective policy queries since mandatory affects all departments
      queryClient.invalidateQueries({
        queryKey: ["department-policies"],
      });
    },
  });
}
