"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MandatoryBadge } from "./MandatoryBadge";
import {
  useSetOverride,
  useRemoveOverride,
  useSetMandatory,
} from "@/hooks/use-department-policies";
import type { DepartmentEffectivePolicy, UserRole } from "@/types/api";

interface PolicyOverrideTableProps {
  policies: DepartmentEffectivePolicy[];
  departmentId: string;
  userRole: UserRole;
}

/**
 * Table of policies with toggle switches for department overrides.
 * Mandatory policies have disabled switches with lock indicators.
 * Source labels distinguish Global vs Department override.
 */
export function PolicyOverrideTable({
  policies,
  departmentId,
  userRole,
}: PolicyOverrideTableProps) {
  const setOverride = useSetOverride();
  const removeOverride = useRemoveOverride();
  const setMandatory = useSetMandatory();

  // Optimistic state for pending toggles
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});

  const isComplianceOfficer = userRole === "compliance_officer" || userRole === "super_admin";

  async function handleToggle(policy: DepartmentEffectivePolicy) {
    const newEnabled = !policy.effectiveEnabled;

    // Optimistic update
    setPendingToggles((prev) => ({ ...prev, [policy.policyId]: newEnabled }));

    try {
      if (!newEnabled && policy.source === "Department override" && policy.overrideId) {
        // If disabling and there's already an override, we still upsert
        await setOverride.mutateAsync({
          department_id: departmentId,
          policy_id: policy.policyId,
          enabled: newEnabled,
        });
      } else if (newEnabled && policy.overrideId && newEnabled === policy.globalEnabled) {
        // If toggling back to global default with an existing override, remove it
        await removeOverride.mutateAsync({
          overrideId: policy.overrideId,
          departmentId,
        });
      } else {
        // Create or update override
        await setOverride.mutateAsync({
          department_id: departmentId,
          policy_id: policy.policyId,
          enabled: newEnabled,
        });
      }
    } catch {
      // Revert optimistic update on error
    } finally {
      setPendingToggles((prev) => {
        const next = { ...prev };
        delete next[policy.policyId];
        return next;
      });
    }
  }

  async function handleMandatoryToggle(policyId: string, currentMandatory: boolean) {
    try {
      await setMandatory.mutateAsync({
        policyId,
        is_mandatory: !currentMandatory,
      });
    } catch {
      // Error handled by mutation error state
    }
  }

  function getEffectiveEnabled(policy: DepartmentEffectivePolicy): boolean {
    if (policy.policyId in pendingToggles) {
      return pendingToggles[policy.policyId];
    }
    return policy.effectiveEnabled;
  }

  if (policies.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
        No policies found. Policies must be created before department overrides can be configured.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Policy Name</th>
            <th className="px-4 py-3 text-left font-medium">Description</th>
            <th className="px-4 py-3 text-left font-medium">Source</th>
            <th className="px-4 py-3 text-center font-medium">Status</th>
            <th className="px-4 py-3 text-center font-medium">Mandatory</th>
            {isComplianceOfficer && (
              <th className="px-4 py-3 text-center font-medium">Set Mandatory</th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((policy) => {
            const effectiveEnabled = getEffectiveEnabled(policy);
            const differsFromGlobal = effectiveEnabled !== policy.globalEnabled;

            return (
              <tr
                key={policy.policyId}
                className={
                  policy.source === "Department override"
                    ? "border-b bg-purple-50/50 dark:bg-purple-950/10"
                    : "border-b"
                }
              >
                {/* Policy Name */}
                <td className="px-4 py-3 font-medium">{policy.name}</td>

                {/* Description (truncated) */}
                <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                  {policy.description || "--"}
                </td>

                {/* Source Badge */}
                <td className="px-4 py-3">
                  {policy.source === "Global" ? (
                    <Badge
                      variant="outline"
                      className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/20"
                    >
                      Global
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-950/20"
                    >
                      Department override
                    </Badge>
                  )}
                </td>

                {/* Status Toggle */}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Switch
                      checked={effectiveEnabled}
                      onCheckedChange={() => handleToggle(policy)}
                      disabled={policy.isMandatory}
                      aria-label={`Toggle ${policy.name}`}
                    />
                    {differsFromGlobal && (
                      <span
                        className="text-xs text-amber-600 dark:text-amber-400"
                        title="Differs from global setting"
                      >
                        *
                      </span>
                    )}
                  </div>
                </td>

                {/* Mandatory Badge */}
                <td className="px-4 py-3 text-center">
                  <MandatoryBadge isMandatory={policy.isMandatory} />
                </td>

                {/* Compliance Officer: Mandatory Toggle */}
                {isComplianceOfficer && (
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={policy.isMandatory}
                      onCheckedChange={() =>
                        handleMandatoryToggle(policy.policyId, policy.isMandatory)
                      }
                      size="sm"
                      aria-label={`Set ${policy.name} as mandatory`}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
