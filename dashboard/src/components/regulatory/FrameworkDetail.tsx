"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useFramework,
  useActivateFramework,
  useDeactivateFramework,
  useToggleFrameworkPolicy,
} from "@/hooks/use-regulatory";

function compilationBadgeClass(status: string | null) {
  switch (status) {
    case "compiled":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

interface FrameworkDetailProps {
  slug: string;
  onBack: () => void;
}

export function FrameworkDetail({ slug, onBack }: FrameworkDetailProps) {
  const { data, isLoading } = useFramework(slug);
  const activate = useActivateFramework();
  const deactivate = useDeactivateFramework();
  const togglePolicy = useToggleFrameworkPolicy();

  const framework = data?.data;

  if (isLoading || !framework) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const handleToggleActive = () => {
    if (framework.isActive) {
      deactivate.mutate(slug);
    } else {
      activate.mutate(slug);
    }
  };

  const handleTogglePolicy = (policyId: string, currentRequired: boolean) => {
    togglePolicy.mutate({
      slug,
      policyId,
      isRequired: !currentRequired,
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button and header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          <ArrowLeft className="size-4 mr-1" />
          Back to Frameworks
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{framework.name}</h2>
            {framework.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {framework.description}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              {framework.jurisdiction && (
                <Badge variant="secondary">{framework.jurisdiction}</Badge>
              )}
              {framework.version && (
                <Badge variant="outline">v{framework.version}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
              disabled={activate.isPending || deactivate.isPending}
            />
          </div>
        </div>
      </div>

      {/* Policies table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Policies ({framework.policies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {framework.policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No policies configured for this framework.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {framework.policies.map((fp) => (
                    <TableRow key={fp.id}>
                      <TableCell className="font-medium">
                        {fp.policyName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fp.requirementRef || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {fp.requirementDescription || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={compilationBadgeClass(fp.compilationStatus)}
                        >
                          {fp.compilationStatus ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={fp.isRequired}
                          onCheckedChange={() =>
                            handleTogglePolicy(fp.policyId, fp.isRequired)
                          }
                          disabled={togglePolicy.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
