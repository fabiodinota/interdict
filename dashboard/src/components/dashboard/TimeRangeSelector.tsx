"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export type TimeRange = "24h" | "7d" | "30d";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  onRefresh: () => void;
  lastUpdated: Date | null;
}

const RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

export function getDateRange(range: TimeRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  switch (range) {
    case "24h":
      from.setHours(from.getHours() - 24);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function TimeRangeSelector({
  value,
  onChange,
  onRefresh,
  lastUpdated,
}: TimeRangeSelectorProps) {
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateSecondsAgo = useCallback(() => {
    if (lastUpdated) {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }
  }, [lastUpdated]);

  useEffect(() => {
    updateSecondsAgo();
    intervalRef.current = setInterval(updateSecondsAgo, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [updateSecondsAgo]);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={value === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {secondsAgo !== null && (
          <span className="text-xs text-muted-foreground">
            Last updated: {secondsAgo}s ago
          </span>
        )}
        <Button variant="outline" size="icon-sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
