"use client";

import Link from "next/link";
import {
  TrendingUp,
  Clock,
  Repeat,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnomalyAlert } from "@/types/api";
import { BaselineChart } from "./BaselineChart";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  AnomalyAlert["type"],
  { label: string; icon: React.ElementType }
> = {
  volume_spike: { label: "Volume Spike", icon: TrendingUp },
  off_hours: { label: "Off-Hours Usage", icon: Clock },
  vendor_switch: { label: "Vendor Switch", icon: Repeat },
  topic_drift: { label: "Topic Drift", icon: MessageSquare },
};

const SEVERITY_CONFIG: Record<
  AnomalyAlert["severity"],
  { badge: string; stripe: string; barColor: string }
> = {
  info: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    stripe: "bg-blue-500",
    barColor: "#3b82f6",
  },
  warning: {
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    stripe: "bg-amber-500",
    barColor: "#f59e0b",
  },
  critical: {
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    stripe: "bg-red-500",
    barColor: "#ef4444",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AnomalyCardProps {
  alert: AnomalyAlert;
}

export function AnomalyCard({ alert }: AnomalyCardProps) {
  const typeConfig = TYPE_CONFIG[alert.type];
  const severityConfig = SEVERITY_CONFIG[alert.severity];
  const Icon = typeConfig.icon;

  const baselineAvg =
    typeof alert.baseline.avg_count === "number"
      ? alert.baseline.avg_count
      : undefined;
  const currentCount =
    typeof alert.current.current_count === "number"
      ? alert.current.current_count
      : undefined;

  return (
    <Card className="relative overflow-hidden">
      {/* Left color stripe */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          severityConfig.stripe
        )}
      />

      <CardHeader className="pb-2 pl-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{typeConfig.label}</span>
            <Badge className={cn("text-xs", severityConfig.badge)}>
              {alert.severity}
            </Badge>
          </div>
        </div>
        <p className="text-sm font-semibold">{alert.actorIdentity}</p>
      </CardHeader>

      <CardContent className="space-y-3 pl-5">
        {/* Summary */}
        <p className="text-sm text-muted-foreground">{alert.summary}</p>

        {/* Baseline context */}
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-xs text-muted-foreground">
              {Object.entries(alert.baseline).map(([key, val]) => (
                <div key={key}>
                  <span className="font-medium">Baseline {key}:</span> {String(val)}
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {Object.entries(alert.current).map(([key, val]) => (
                <div key={key}>
                  <span className="font-medium">Current {key}:</span> {String(val)}
                </div>
              ))}
            </div>
          </div>

          {/* Inline chart for volume spikes */}
          {alert.type === "volume_spike" &&
            baselineAvg !== undefined &&
            currentCount !== undefined && (
              <BaselineChart
                baseline={baselineAvg}
                current={currentCount}
                severity={alert.severity}
              />
            )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {alert.actions.map((action) => (
            <Button
              key={action.href}
              variant="outline"
              size="sm"
              asChild
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>

        {/* Timestamp footer */}
        <p className="text-xs text-muted-foreground/60">
          Detected at{" "}
          {new Date(alert.detectedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
