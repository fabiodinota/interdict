"use client";

import { useState, useEffect } from "react";
import { differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";

// Total SLA = 4 hours = 14400 seconds
const TOTAL_SLA_SECONDS = 4 * 60 * 60;

// ---------------------------------------------------------------------------
// Module-level tick manager: one setInterval drives all mounted SlaTimer
// instances. The interval starts when the first subscriber mounts and stops
// when the last one unmounts — no leaked timers.
// ---------------------------------------------------------------------------
const subscribers = new Set<() => void>();
let tickInterval: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  if (subscribers.size === 1 && !tickInterval) {
    tickInterval = setInterval(() => {
      subscribers.forEach((cb) => cb());
    }, 1000);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  };
}

interface SlaTimerProps {
  deadline: string; // ISO UTC timestamp
  className?: string;
}

/**
 * SLA countdown timer with color-coded severity.
 *
 * Color logic based on remaining fraction of total SLA:
 * - remaining/total > 0.25 = default (gray badge)
 * - remaining/total <= 0.25 = warning (yellow/amber)
 * - remaining <= 0 = destructive (red, "EXPIRED")
 */
export function SlaTimer({ deadline, className }: SlaTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    differenceInSeconds(new Date(deadline), new Date()),
  );

  useEffect(() => {
    const tick = () => {
      setRemainingSeconds(differenceInSeconds(new Date(deadline), new Date()));
    };
    tick(); // fire immediately so value is current
    return subscribe(tick);
  }, [deadline]);

  // Format the display
  const formatTime = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return "EXPIRED";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  };

  // Determine variant based on remaining fraction
  const fraction = remainingSeconds / TOTAL_SLA_SECONDS;

  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let extraClasses = "";

  if (remainingSeconds <= 0) {
    variant = "destructive";
  } else if (fraction <= 0.25) {
    variant = "default";
    extraClasses = "bg-amber-500 hover:bg-amber-600 text-white";
  }

  return (
    <Badge variant={variant} className={`font-mono text-xs ${extraClasses} ${className ?? ""}`}>
      {formatTime(remainingSeconds)}
    </Badge>
  );
}
