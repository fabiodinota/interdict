"use client";

import { CheckCircle, Loader2, AlertCircle, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ReportProgressProps {
  isGenerating: boolean;
  isSuccess: boolean;
  isError: boolean;
  errorMessage?: string;
  filename?: string;
}

export function ReportProgress({
  isGenerating,
  isSuccess,
  isError,
  errorMessage,
  filename,
}: ReportProgressProps) {
  if (!isGenerating && !isSuccess && !isError) return null;

  return (
    <Card>
      <CardContent className="py-6">
        {/* Generating */}
        {isGenerating && (
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Generating report...</p>
              <p className="text-sm text-muted-foreground">
                Querying audit data and building the report. This may take a moment.
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {!isGenerating && isSuccess && (
          <div className="flex items-center gap-3">
            <CheckCircle className="size-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium">Report ready!</p>
              <p className="text-sm text-muted-foreground">
                <Download className="size-3 inline mr-1" />
                {filename ? `Downloaded ${filename}` : "Your report has been downloaded."}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {!isGenerating && isError && (
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium">Report generation failed</p>
              <p className="text-sm text-muted-foreground">
                {errorMessage || "An unexpected error occurred. Please try again."}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
