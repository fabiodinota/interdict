"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { ApiResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorModel {
  id: string;
  vendor_id: string;
  model_name: string;
  status: "approved" | "blocked";
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  base_url: string | null;
  description: string | null;
  status: "approved" | "blocked";
  created_at: string;
  updated_at: string;
  models?: VendorModel[];
}

interface VendorListResponse {
  success: boolean;
  data: Vendor[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Paginated vendor list */
export function useVendors(cursor?: string) {
  return useQuery<VendorListResponse>({
    queryKey: ["vendors", cursor],
    queryFn: () => {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return api<VendorListResponse>(`/vendors${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** Single vendor with models */
export function useVendor(id: string) {
  return useQuery<ApiResponse<Vendor>>({
    queryKey: ["vendors", id],
    queryFn: () => api<ApiResponse<Vendor>>(`/vendors/${id}`),
    enabled: !!id,
  });
}

/** Create a new vendor */
export function useCreateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      display_name: string;
      base_url?: string;
      description?: string;
    }) =>
      api<ApiResponse<Vendor>>("/vendors", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create vendor", { description: error.message });
    },
  });
}

/** Update a vendor (status changes, display name, etc.) */
export function useUpdateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      display_name?: string;
      status?: "approved" | "blocked";
      base_url?: string;
      description?: string;
    }) =>
      api<ApiResponse<Vendor>>(`/vendors/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update vendor", { description: error.message });
    },
  });
}

/** Add a model to a vendor */
export function useAddModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vendorId,
      model_name,
      status,
    }: {
      vendorId: string;
      model_name: string;
      status?: "approved" | "blocked";
    }) =>
      api<ApiResponse<VendorModel>>(`/vendors/${vendorId}/models`, {
        method: "POST",
        body: JSON.stringify({ model_name, status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Model added");
    },
    onError: (error: Error) => {
      toast.error("Failed to add model", { description: error.message });
    },
  });
}

/** Update a model (status change) */
export function useUpdateModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vendorId,
      modelId,
      status,
    }: {
      vendorId: string;
      modelId: string;
      status: "approved" | "blocked";
    }) =>
      api<ApiResponse<VendorModel>>(`/vendors/${vendorId}/models/${modelId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Model status updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update model", { description: error.message });
    },
  });
}

/** Delete a model from a vendor */
export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      vendorId,
      modelId,
    }: {
      vendorId: string;
      modelId: string;
    }) =>
      api<ApiResponse<null>>(`/vendors/${vendorId}/models/${modelId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Model removed");
    },
    onError: (error: Error) => {
      toast.error("Failed to remove model", { description: error.message });
    },
  });
}
