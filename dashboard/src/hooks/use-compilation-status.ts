"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { CompilationStatusResponse } from "@/types/policy-templates";

// Poll compilation status for a policy
// Polls every 2 seconds while status is "pending" or "compiling"
// Stops polling once status is "compiled" or "failed"
export function useCompilationStatus(policyId: string, enabled: boolean) {
  return useQuery<ApiResponse<CompilationStatusResponse>>({
    queryKey: ["policies", policyId, "compilation-status"],
    queryFn: () =>
      api<ApiResponse<CompilationStatusResponse>>(`/policies/${policyId}/compilation-status`),
    enabled: enabled && !!policyId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.data) return 2000;
      const status = data.data.status;
      if (status === "pending" || status === "compiling") return 2000;
      return false;
    },
  });
}
