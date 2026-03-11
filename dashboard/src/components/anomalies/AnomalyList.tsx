"use client";

import { ShieldAlert } from "lucide-react";
import type { AnomalyAlert } from "@/types/api";
import { AnomalyCard } from "./AnomalyCard";

// ---------------------------------------------------------------------------
// AnomalyList -- container rendering sorted anomaly cards
// ---------------------------------------------------------------------------

interface AnomalyListProps {
  alerts: AnomalyAlert[];
}

export function AnomalyList({ alerts }: AnomalyListProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <ShieldAlert className="mb-4 size-10 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">No anomalies detected</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          The system is monitoring for volume spikes, off-hours usage, vendor switching, and topic
          drift. Alerts will appear here when deviations from established baselines are detected.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {alerts.map((alert, idx) => (
        <AnomalyCard key={`${alert.type}-${alert.actorIdentity}-${idx}`} alert={alert} />
      ))}
    </div>
  );
}
