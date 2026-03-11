"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportRequest {
  format: "pdf" | "csv";
  from_date: string;
  to_date: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Generate a compliance report. Sends POST to the BFF proxy,
 * receives binary data, and triggers a browser download.
 */
export function useGenerateReport() {
  return useMutation({
    mutationFn: async (request: ReportRequest) => {
      const res = await fetch("/api/proxy/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({
          error: { message: res.statusText },
        }));
        throw new Error(error.error?.message || `Report generation failed (${res.status})`);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      const ext = request.format === "pdf" ? "pdf" : "csv";
      const filename =
        filenameMatch?.[1] || `interdict-report-${new Date().toISOString().split("T")[0]}.${ext}`;

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { filename };
    },
    onSuccess: (data) => {
      toast.success("Report ready!", {
        description: `Downloaded ${data.filename}`,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to generate report", {
        description: error.message,
      });
    },
  });
}
