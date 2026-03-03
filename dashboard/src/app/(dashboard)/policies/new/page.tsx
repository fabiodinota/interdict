"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PolicyWizard } from "@/components/policies/PolicyWizard";

function PolicyPageTitle() {
  const searchParams = useSearchParams();
  const isEditMode = !!searchParams.get("edit");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {isEditMode ? "Edit Policy" : "Create Policy"}
      </h1>
      <p className="text-muted-foreground mt-1">
        {isEditMode
          ? "Modify an existing governance policy"
          : "Build a new governance policy using the wizard or raw Rego editor"}
      </p>
    </div>
  );
}

export default function NewPolicyPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/policies">
            <ArrowLeft className="size-4" />
            Back to Policies
          </Link>
        </Button>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <PolicyPageTitle />
        <PolicyWizard />
      </Suspense>
    </div>
  );
}
