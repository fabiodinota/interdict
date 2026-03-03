"use client";

import { Building2, Shield, Gauge, Code } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { POLICY_CATEGORIES, getTemplatesForCategory } from "@/lib/rego-templates";
import type { PolicyCategory } from "@/types/policy-templates";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Building2,
  Shield,
  Gauge,
  Code,
};

interface CategoryPickerProps {
  selectedCategory: PolicyCategory | null;
  onSelect: (category: PolicyCategory) => void;
}

export function CategoryPicker({
  selectedCategory,
  onSelect,
}: CategoryPickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Choose a Category</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select a policy category to get started with pre-built templates.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {POLICY_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.icon] ?? Code;
          const templateCount = getTemplatesForCategory(category.id).length;
          const isSelected = selectedCategory === category.id;

          return (
            <Card
              key={category.id}
              className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
                isSelected
                  ? "border-primary ring-2 ring-primary/20"
                  : ""
              }`}
              onClick={() => onSelect(category.id)}
            >
              <CardContent className="flex items-start gap-4 pt-0">
                <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                  <Icon className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-sm">{category.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {category.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {templateCount} template{templateCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
