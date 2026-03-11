"use client";

import { useState, useEffect } from "react";
import { differenceInSeconds } from "date-fns";
import { Badge } from "@/components/ui/badge";

// Total SLA = 4 hours = 14400 seconds
const TOTAL_SLA_SECONDS = 4 * 60 * 60;

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
    const timer = setInterval(() => {
      setRemainingSeconds(differenceInSeconds(new Date(deadline), new Date()));
    }, 1000);

    return () => clearInterval(timer);
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
