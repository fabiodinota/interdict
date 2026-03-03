"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MandatoryBadgeProps {
  isMandatory: boolean;
}

/**
 * Badge indicating a policy is mandatory and cannot be disabled
 * by department managers. Shows a lock icon with tooltip.
 */
export function MandatoryBadge({ isMandatory }: MandatoryBadgeProps) {
  if (!isMandatory) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="gap-1 text-muted-foreground"
          >
            <Lock className="h-3 w-3" />
            Mandatory
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            This policy is mandatory and cannot be disabled by department
            managers
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
