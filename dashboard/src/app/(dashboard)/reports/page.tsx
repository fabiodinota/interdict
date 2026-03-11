"use client";

import { ReportForm } from "@/components/reports/ReportForm";
import { ReportProgress } from "@/components/reports/ReportProgress";
import { useGenerateReport } from "@/hooks/use-reports";

export default function ReportsPage() {
  const generateReport = useGenerateReport();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate PDF or CSV compliance reports for regulators and stakeholders
        </p>
      </div>

      <div className="max-w-2xl space-y-4">
        <ReportForm
          onGenerate={(request) => generateReport.mutate(request)}
          isGenerating={generateReport.isPending}
        />

        <ReportProgress
          isGenerating={generateReport.isPending}
          isSuccess={generateReport.isSuccess}
          isError={generateReport.isError}
          errorMessage={generateReport.error?.message}
          filename={generateReport.data?.filename}
        />
      </div>
    </div>
  );
}
