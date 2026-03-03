"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationResult } from "@/types/api";

// ---------------------------------------------------------------------------
// Overall banner
// ---------------------------------------------------------------------------

function OverallBanner({ overall }: { overall: VerificationResult["overall"] }) {
  const config = {
    pass: {
      label: "All checks passed",
      className:
        "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    },
    fail: {
      label: "Verification failed",
      className:
        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    },
    partial: {
      label: "Partial verification",
      className:
        "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    },
  }[overall];

  return (
    <div
      className={`rounded-md border px-4 py-2 text-sm font-medium ${config.className}`}
    >
      {config.label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step icon
// ---------------------------------------------------------------------------

function StepIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) {
    return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />;
  }
  if (passed === false) {
    return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />;
  }
  return <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />;
}

// ---------------------------------------------------------------------------
// Step badge
// ---------------------------------------------------------------------------

function StepBadge({ passed }: { passed: boolean | null }) {
  if (passed === true) {
    return (
      <Badge
        variant="outline"
        className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
      >
        Pass
      </Badge>
    );
  }
  if (passed === false) {
    return (
      <Badge
        variant="outline"
        className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
      >
        Fail
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
    >
      N/A
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// VerificationStepper
// ---------------------------------------------------------------------------

interface VerificationStepperProps {
  result: VerificationResult;
  defaultExpanded?: boolean;
}

export function VerificationStepper({
  result,
  defaultExpanded = false,
}: VerificationStepperProps) {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>(
    defaultExpanded
      ? Object.fromEntries(result.steps.map((_, i) => [i, true]))
      : {}
  );

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="space-y-3">
      <OverallBanner overall={result.overall} />

      <div className="space-y-2">
        {result.steps.map((step, index) => {
          const isExpanded = expandedSteps[index] ?? false;

          return (
            <div key={index} className="rounded-md border">
              <button
                type="button"
                onClick={() => toggleStep(index)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <StepIcon passed={step.passed} />
                <span className="flex-1 text-sm font-medium">{step.name}</span>
                <StepBadge passed={step.passed} />
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isExpanded && Object.keys(step.details).length > 0 && (
                <div className="border-t px-4 py-3 bg-muted/30">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                    {Object.entries(step.details)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join("\n")}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
