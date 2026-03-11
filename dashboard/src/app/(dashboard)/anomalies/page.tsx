"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAnomalies, useAnomalySummary } from "@/hooks/use-anomalies";
import { AnomalyList } from "@/components/anomalies/AnomalyList";

// ---------------------------------------------------------------------------
// Severity filter tabs
// ---------------------------------------------------------------------------

const SEVERITY_TABS = [
  { key: undefined, label: "All" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warning" },
  { key: "info", label: "Info" },
] as const;

// ---------------------------------------------------------------------------
// KPI card config
// ---------------------------------------------------------------------------

const KPI_CARDS = [
  {
    key: "total" as const,
    label: "Total Alerts",
    icon: ShieldAlert,
    accent: "text-slate-600 dark:text-slate-400",
    iconBg: "bg-slate-100 dark:bg-slate-950",
  },
  {
    key: "critical" as const,
    label: "Critical",
    icon: AlertTriangle,
    accent: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-100 dark:bg-red-950",
  },
  {
    key: "warning" as const,
    label: "Warning",
    icon: AlertCircle,
    accent: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-950",
  },
  {
    key: "info" as const,
    label: "Info",
    icon: Info,
    accent: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-950",
  },
];

const formatter = new Intl.NumberFormat("en-US");

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AnomaliesPage() {
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined);

  const {
    data: alertsResponse,
    isLoading: alertsLoading,
    dataUpdatedAt,
  } = useAnomalies(severityFilter);
  const { data: summaryResponse, isLoading: summaryLoading } = useAnomalySummary();

  const alerts = alertsResponse?.data ?? [];
  const summary = summaryResponse?.data;

  // Compute "Updated X seconds ago" — driven by a 1s interval to avoid
  // calling the impure Date.now() during render.
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const tick = () => setSecondsAgo(Math.round((Date.now() - dataUpdatedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anomaly Detection</h1>
          <p className="text-muted-foreground mt-1">
            Statistical deviations from established user behavior baselines
          </p>
        </div>
        {secondsAgo !== null && (
          <p className="text-xs text-muted-foreground">Updated {secondsAgo}s ago</p>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((card) => {
          const Icon = card.icon;
          const value = summary ? summary[card.key] : undefined;

          return (
            <Card key={card.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <div className={cn("rounded-md p-2", card.iconBg)}>
                  <Icon className={cn("size-4", card.accent)} />
                </div>
              </CardHeader>
              <CardContent>
                {summaryLoading || value === undefined ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold tracking-tight">{formatter.format(value)}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Severity Filter Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        {SEVERITY_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setSeverityFilter(tab.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              severityFilter === tab.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alert List */}
      {alertsLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <AnomalyList alerts={alerts} />
      )}
    </div>
  );
}
