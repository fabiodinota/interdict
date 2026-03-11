"use client";

import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSSE } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";

interface AuditEvent {
  timestamp: string;
  actor_identity?: string;
  actor_display_name?: string;
  vendor?: string;
  model?: string;
  policy_action?: string;
  bundle_id?: string;
}

const ACTION_STYLES: Record<
  string,
  { variant: "default" | "destructive" | "secondary" | "outline"; label: string; className: string }
> = {
  allow: {
    variant: "secondary",
    label: "Allow",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  block: {
    variant: "destructive",
    label: "Block",
    className: "",
  },
  redact: {
    variant: "secondary",
    label: "Redact",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLES[action] ?? {
    variant: "outline" as const,
    label: action,
    className: "",
  };

  return (
    <Badge variant={style.variant} className={cn("text-xs", style.className)}>
      {style.label}
    </Badge>
  );
}

function formatRelativeTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return "just now";
  }
}

export function ActivityFeed() {
  const { events, connected, clear } = useSSE<AuditEvent>("/api/proxy/audit/stream");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Live Activity</CardTitle>
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              connected
                ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
            )}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
        <Button variant="ghost" size="xs" onClick={clear}>
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {events.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="animate-pulse text-sm text-muted-foreground">Waiting for events...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((evt) => {
                const data = evt.data;
                const actor = data.actor_display_name || data.actor_identity || "Unknown";
                const vendorModel = [data.vendor, data.model].filter(Boolean).join(" / ");

                return (
                  <div
                    key={evt.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{actor}</span>
                        {data.policy_action && <ActionBadge action={data.policy_action} />}
                      </div>
                      {vendorModel && (
                        <p className="text-xs text-muted-foreground truncate">{vendorModel}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
