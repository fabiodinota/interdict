"use client";

import { useState } from "react";
import { format, subDays, startOfQuarter, startOfYear } from "date-fns";
import { CalendarIcon, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportRequest } from "@/hooks/use-reports";

interface ReportFormProps {
  onGenerate: (request: ReportRequest) => void;
  isGenerating: boolean;
}

interface DatePreset {
  label: string;
  getRange: () => { from: Date; to: Date };
}

const DATE_PRESETS: DatePreset[] = [
  {
    label: "Last 7 days",
    getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: "Last 30 days",
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: "Last quarter",
    getRange: () => {
      const now = new Date();
      const currentQuarterStart = startOfQuarter(now);
      const prevQuarterStart = new Date(currentQuarterStart);
      prevQuarterStart.setMonth(prevQuarterStart.getMonth() - 3);
      return { from: prevQuarterStart, to: currentQuarterStart };
    },
  },
  {
    label: "Year to date",
    getRange: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

export function ReportForm({ onGenerate, isGenerating }: ReportFormProps) {
  const [fromDate, setFromDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [reportFormat, setReportFormat] = useState<"pdf" | "csv">("pdf");

  const handlePreset = (preset: DatePreset) => {
    const { from, to } = preset.getRange();
    setFromDate(from);
    setToDate(to);
  };

  const handleGenerate = () => {
    if (!fromDate || !toDate) return;
    onGenerate({
      format: reportFormat,
      from_date: fromDate.toISOString(),
      to_date: toDate.toISOString(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Generate Compliance Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date presets */}
        <div>
          <Label className="text-sm text-muted-foreground">Quick select</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => handlePreset(preset)}
                disabled={isGenerating}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom date range */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[180px] justify-start text-left font-normal"
                  disabled={isGenerating}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {fromDate ? format(fromDate, "MMM d, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[180px] justify-start text-left font-normal"
                  disabled={isGenerating}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {toDate ? format(toDate, "MMM d, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Format</Label>
            <Select
              value={reportFormat}
              onValueChange={(v) => setReportFormat(v as "pdf" | "csv")}
              disabled={isGenerating}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4" />
                    PDF
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="size-4" />
                    CSV
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Report content preview */}
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Report includes:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Executive summary with key performance metrics</li>
            <li>Policy violations by type, department, and vendor</li>
            <li>Top 10 security incidents during the period</li>
            <li>Active policies and their compilation status</li>
            <li>Vendor approval status and model counts</li>
            <li>Regulatory framework compliance status</li>
          </ul>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !fromDate || !toDate}
          className="w-full"
          size="lg"
        >
          {reportFormat === "pdf" ? (
            <FileText className="size-4 mr-2" />
          ) : (
            <FileSpreadsheet className="size-4 mr-2" />
          )}
          Generate {reportFormat.toUpperCase()} Report
        </Button>
      </CardContent>
    </Card>
  );
}
