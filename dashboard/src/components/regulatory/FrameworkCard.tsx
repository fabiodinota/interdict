"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useActivateFramework, useDeactivateFramework } from "@/hooks/use-regulatory";
import type { FrameworkSummary } from "@/hooks/use-regulatory";

interface FrameworkCardProps {
  framework: FrameworkSummary;
  onSelect: (slug: string) => void;
}

export function FrameworkCard({ framework, onSelect }: FrameworkCardProps) {
  const activate = useActivateFramework();
  const deactivate = useDeactivateFramework();

  const handleToggleActive = () => {
    if (framework.isActive) {
      deactivate.mutate(framework.slug);
    } else {
      activate.mutate(framework.slug);
    }
  };

  const isPending = activate.isPending || deactivate.isPending;

  return (
    <Card className="relative cursor-pointer hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0" onClick={() => onSelect(framework.slug)}>
            <CardTitle className="text-base truncate">{framework.name}</CardTitle>
            {framework.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{framework.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={
                framework.isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                  : "bg-muted text-muted-foreground"
              }
            >
              {framework.isActive ? "Active" : "Inactive"}
            </Badge>
            <Switch
              checked={framework.isActive}
              onCheckedChange={handleToggleActive}
              disabled={isPending}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0" onClick={() => onSelect(framework.slug)}>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {framework.jurisdiction && (
            <Badge variant="secondary" className="text-xs">
              {framework.jurisdiction}
            </Badge>
          )}
          {framework.version && <span>v{framework.version}</span>}
          <span>
            {framework.activePolicyCount}/{framework.policyCount} policies active
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
