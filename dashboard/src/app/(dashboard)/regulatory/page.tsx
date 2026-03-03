"use client";

import { useState } from "react";
import { FrameworkList } from "@/components/regulatory/FrameworkList";
import { FrameworkDetail } from "@/components/regulatory/FrameworkDetail";

export default function RegulatoryPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-4">
      {!selectedSlug && (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Regulatory Frameworks
            </h1>
            <p className="text-muted-foreground mt-1">
              Select jurisdictions and manage compliance policy configurations
            </p>
          </div>
          <FrameworkList onSelectFramework={setSelectedSlug} />
        </>
      )}

      {selectedSlug && (
        <FrameworkDetail
          slug={selectedSlug}
          onBack={() => setSelectedSlug(null)}
        />
      )}
    </div>
  );
}
