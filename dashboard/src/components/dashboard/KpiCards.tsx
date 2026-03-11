"use client";

import { Activity, AlertTriangle, Shield, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiCardsProps {
  totalRequests: number;
  violationsToday: number;
  activePolicies: number | undefined;
  activeVendors: number | undefined;
  isLoading: boolean;
}

interface KpiCardConfig {
  label: string;
  icon: React.ElementType;
  accent: string;
  iconBg: string;
}

const KPI_CARDS: KpiCardConfig[] = [
  {
    label: "Total Requests",
    icon: Activity,
    accent: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-950",
  },
  {
    label: "Violations Today",
    icon: AlertTriangle,
    accent: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-100 dark:bg-red-950",
  },
  {
    label: "Active Policies",
    icon: Shield,
    accent: "text-green-600 dark:text-green-400",
    iconBg: "bg-green-100 dark:bg-green-950",
  },
  {
    label: "Active Vendors",
    icon: Building2,
    accent: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-100 dark:bg-purple-950",
  },
];

const formatter = new Intl.NumberFormat("en-US");

export function KpiCards({
  totalRequests,
  violationsToday,
  activePolicies,
  activeVendors,
  isLoading,
}: KpiCardsProps) {
  const values = [totalRequests, violationsToday, activePolicies, activeVendors];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {KPI_CARDS.map((card, idx) => {
        const Icon = card.icon;
        const val = values[idx];

        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <div className={cn("rounded-md p-2", card.iconBg)}>
                <Icon className={cn("size-4", card.accent)} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || val === undefined ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold tracking-tight">{formatter.format(val)}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
