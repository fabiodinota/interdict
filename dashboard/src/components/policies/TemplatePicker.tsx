"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTemplatesForCategory } from "@/lib/rego-templates";
import type { PolicyCategory, PolicyTemplate } from "@/types/policy-templates";

interface TemplatePickerProps {
  category: PolicyCategory;
  selectedTemplate: PolicyTemplate | null;
  onSelect: (template: PolicyTemplate) => void;
  onBack: () => void;
}

export function TemplatePicker({
  category,
  selectedTemplate,
  onSelect,
  onBack,
}: TemplatePickerProps) {
  const templates = getTemplatesForCategory(category);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Choose a Template</h3>
          <p className="text-sm text-muted-foreground">
            Select a template to pre-fill your policy configuration.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {templates.map((template) => {
          const isSelected = selectedTemplate?.id === template.id;

          return (
            <Card
              key={template.id}
              className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
                isSelected ? "border-primary ring-2 ring-primary/20" : ""
              }`}
              onClick={() => onSelect(template)}
            >
              <CardContent className="pt-0">
                <h4 className="font-medium text-sm">{template.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {template.parameters.length} configurable parameter
                  {template.parameters.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {templates.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No templates available for this category. Use the Raw Rego Editor instead.
          </div>
        )}
      </div>
    </div>
  );
}
