"use client";

import { useState } from "react";
import { ClipboardCheck, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewQueue } from "@/components/reviews/ReviewQueue";

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  icon: Icon,
  className,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${className ?? "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reviews Page
// ---------------------------------------------------------------------------

export default function ReviewsPage() {
  const [stats, setStats] = useState({
    pending: 0,
    claimed: 0,
    resolvedToday: 0,
    expired: 0,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Human Review Queue
        </h1>
        <p className="text-muted-foreground mt-1">
          Layer 3 escalated interactions requiring human judgment. Items enter
          this queue when policy enforcement flags an interaction for compliance
          officer review.
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Pending Review"
          value={stats.pending}
          icon={Clock}
          className="text-amber-500"
        />
        <KpiCard
          title="In Progress"
          value={stats.claimed}
          icon={ClipboardCheck}
          className="text-blue-500"
        />
        <KpiCard
          title="Resolved Today"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          className="text-green-500"
        />
        <KpiCard
          title="Expired / Auto-escalated"
          value={stats.expired}
          icon={AlertTriangle}
          className="text-destructive"
        />
      </div>

      {/* Review Queue */}
      <ReviewQueue onStatsUpdate={setStats} />
    </div>
  );
}
