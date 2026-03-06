"use client";

import { useMemo } from "react";
import { Shield, ToggleRight, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffectivePolicies } from "@/hooks/use-department-policies";
import { PolicyOverrideTable } from "@/components/department-policies/PolicyOverrideTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export default function DepartmentPoliciesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const departmentIds = user?.departmentIds ?? [];

  // Auto-select first department, or allow selection if multiple
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<
    string | undefined
  >(undefined);

  // Use first department as default once loaded
  const activeDepartmentId =
    selectedDepartmentId ?? departmentIds[0] ?? undefined;

  const {
    data: effectiveData,
    isLoading: policiesLoading,
    error,
  } = useEffectivePolicies(activeDepartmentId);

  const policies = effectiveData?.data ?? [];

  // Summary stats
  const stats = useMemo(() => {
    const total = policies.length;
    const overrides = policies.filter(
      (p) => p.source === "Department override"
    ).length;
    const mandatory = policies.filter((p) => p.isMandatory).length;
    return { total, overrides, mandatory };
  }, [policies]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  // No departments assigned
  if (!user || departmentIds.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Department Policy Management</h1>
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
          You are not assigned to any department. Contact your administrator to
          be assigned to a department before managing policy overrides.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Department Policy Management</h1>
        <p className="text-muted-foreground mt-1">
          Toggle inherited policies for your department. Mandatory policies
          cannot be disabled.
        </p>
      </div>

      {/* Department Selector (if multiple departments) */}
      {departmentIds.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Department:</label>
          <Select
            value={activeDepartmentId}
            onValueChange={setSelectedDepartmentId}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departmentIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <Shield className="h-8 w-8 text-blue-500" />
          <div>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Policies</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <ToggleRight className="h-8 w-8 text-purple-500" />
          <div>
            <p className="text-2xl font-bold">{stats.overrides}</p>
            <p className="text-xs text-muted-foreground">Active Overrides</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <Lock className="h-8 w-8 text-amber-500" />
          <div>
            <p className="text-2xl font-bold">{stats.mandatory}</p>
            <p className="text-xs text-muted-foreground">Mandatory Policies</p>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load policies:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Policy Table */}
      {policiesLoading ? (
        <div className="flex items-center justify-center rounded-lg border p-12 text-muted-foreground">
          Loading policies...
        </div>
      ) : activeDepartmentId ? (
        <PolicyOverrideTable
          policies={policies}
          departmentId={activeDepartmentId}
          userRole={user.role}
        />
      ) : null}
    </div>
  );
}
