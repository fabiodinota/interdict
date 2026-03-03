"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useUpdateVendor } from "@/hooks/use-vendors";
import { ModelList } from "@/components/vendors/ModelList";
import type { Vendor } from "@/hooks/use-vendors";

interface VendorCardProps {
  vendor: Vendor;
}

export function VendorCard({ vendor }: VendorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const updateVendor = useUpdateVendor();

  const isApproved = vendor.status === "approved";

  const handleToggleStatus = () => {
    updateVendor.mutate({
      id: vendor.id,
      status: isApproved ? "blocked" : "approved",
    });
  };

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base truncate">
              {vendor.display_name || vendor.name}
            </CardTitle>
            {vendor.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {vendor.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={
                isApproved
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800"
              }
            >
              {vendor.status}
            </Badge>
            <Switch
              checked={isApproved}
              onCheckedChange={handleToggleStatus}
              disabled={updateVendor.isPending}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {vendor.base_url && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <ExternalLink className="size-3" />
            <span className="truncate">{vendor.base_url}</span>
          </div>
        )}

        {/* Toggle models section */}
        <button
          className="text-xs text-primary hover:underline cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide models" : `Show models (${vendor.models?.length ?? 0})`}
        </button>

        {expanded && (
          <ModelList vendorId={vendor.id} models={vendor.models ?? []} />
        )}
      </CardContent>
    </Card>
  );
}
