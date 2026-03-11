"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useVendorOptions } from "@/hooks/use-audit";
import type { AuditFilters as AuditFiltersType } from "@/hooks/use-audit";

interface AuditFiltersProps {
  filters: AuditFiltersType;
  onFiltersChange: (filters: AuditFiltersType) => void;
}

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "allow", label: "Allow" },
  { value: "block", label: "Block" },
  { value: "redact", label: "Redact" },
];

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export function AuditFilters({ filters, onFiltersChange }: AuditFiltersProps) {
  const router = useRouter();
  const { data: vendorOptions } = useVendorOptions();

  const [localDepartment, setLocalDepartment] = useState(filters.department ?? "");
  const [fromDate, setFromDate] = useState<Date | undefined>(
    filters.from_date ? new Date(filters.from_date) : undefined,
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    filters.to_date ? new Date(filters.to_date) : undefined,
  );

  const syncToUrl = useCallback(
    (newFilters: AuditFiltersType) => {
      const params = new URLSearchParams();
      if (newFilters.vendor) params.set("vendor", newFilters.vendor);
      if (newFilters.department) params.set("department", newFilters.department);
      if (newFilters.policy_action) params.set("policy_action", newFilters.policy_action);
      if (newFilters.from_date) params.set("from_date", newFilters.from_date);
      if (newFilters.to_date) params.set("to_date", newFilters.to_date);
      const qs = params.toString();
      router.replace(`/audit${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router],
  );

  const applyFilters = () => {
    const newFilters: AuditFiltersType = {
      ...(filters.vendor ? { vendor: filters.vendor } : {}),
      ...(localDepartment ? { department: localDepartment } : {}),
      ...(filters.policy_action ? { policy_action: filters.policy_action } : {}),
      ...(fromDate ? { from_date: fromDate.toISOString() } : {}),
      ...(toDate ? { to_date: toDate.toISOString() } : {}),
    };
    onFiltersChange(newFilters);
    syncToUrl(newFilters);
  };

  const clearFilters = () => {
    setLocalDepartment("");
    setFromDate(undefined);
    setToDate(undefined);
    onFiltersChange({});
    router.replace("/audit", { scroll: false });
  };

  const applyDatePreset = (days: number) => {
    const to = new Date();
    const from = days === 0 ? new Date(new Date().setHours(0, 0, 0, 0)) : subDays(to, days);
    setFromDate(from);
    setToDate(to);
  };

  const hasActiveFilters =
    filters.vendor ||
    filters.department ||
    filters.policy_action ||
    filters.from_date ||
    filters.to_date;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Vendor filter */}
        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Vendor</Label>
          <Select
            value={filters.vendor ?? "all"}
            onValueChange={(v) =>
              onFiltersChange({ ...filters, vendor: v === "all" ? undefined : v })
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorOptions?.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Department filter */}
        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Input
            placeholder="Filter by department..."
            value={localDepartment}
            onChange={(e) => setLocalDepartment(e.target.value)}
            className="w-[160px]"
          />
        </div>

        {/* Policy Action filter */}
        <div className="space-y-1.5 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select
            value={filters.policy_action ?? "all"}
            onValueChange={(v) =>
              onFiltersChange({
                ...filters,
                policy_action: v === "all" ? undefined : v,
              })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* From Date */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 size-4" />
                {fromDate ? format(fromDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        {/* To Date */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[150px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 size-4" />
                {toDate ? format(toDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        {/* Action buttons */}
        <div className="flex items-end gap-2">
          <Button onClick={applyFilters}>Apply Filters</Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Date presets */}
      <div className="flex gap-2">
        {DATE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            onClick={() => applyDatePreset(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
