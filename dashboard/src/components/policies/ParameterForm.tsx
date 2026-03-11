"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { PolicyTemplate, TemplateParameter } from "@/types/policy-templates";

interface ParameterFormProps {
  template: PolicyTemplate;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onNext: () => void;
  onBack: () => void;
}

function MultiSelectField({
  param,
  value,
  onChange,
}: {
  param: TemplateParameter;
  value: string[];
  onChange: (val: string[]) => void;
}) {
  const options = param.options ?? [];

  const toggleOption = useCallback(
    (optionValue: string) => {
      if (value.includes(optionValue)) {
        onChange(value.filter((v) => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    },
    [value, onChange],
  );

  return (
    <Command className="rounded-md border">
      <CommandInput placeholder={`Search ${param.label.toLowerCase()}...`} />
      <CommandList>
        <CommandEmpty>No options found.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = value.includes(option.value);
            return (
              <CommandItem key={option.value} onSelect={() => toggleOption(option.value)}>
                <div
                  className={`mr-2 flex size-4 items-center justify-center rounded-sm border ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                {option.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function ParameterField({
  param,
  value,
  onChange,
}: {
  param: TemplateParameter;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  switch (param.type) {
    case "text":
      return (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.placeholder}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={param.placeholder}
        />
      );

    case "select":
      return (
        <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={param.placeholder ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(param.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "toggle":
      return <Switch checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />;

    case "multi-select":
      return (
        <MultiSelectField
          param={param}
          value={Array.isArray(value) ? value : []}
          onChange={(val) => onChange(val)}
        />
      );

    default:
      return null;
  }
}

export function ParameterForm({ template, values, onChange, onNext, onBack }: ParameterFormProps) {
  // Initialize defaults on first mount only
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const defaults: Record<string, unknown> = {};
    let hasNewDefaults = false;
    for (const param of template.parameters) {
      if (values[param.key] === undefined && param.defaultValue !== undefined) {
        defaults[param.key] = param.defaultValue;
        hasNewDefaults = true;
      }
    }
    if (hasNewDefaults) {
      onChange({ ...values, ...defaults });
    }
  }, [template.parameters, values, onChange]);

  function updateValue(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  // Validation: check required fields
  const isValid = template.parameters.every((param) => {
    if (!param.required) return true;
    const val = values[param.key];
    if (val === undefined || val === null || val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  // Generate live preview
  let previewRego = "";
  try {
    previewRego = template.generateRego(values);
  } catch {
    previewRego = "// Error generating Rego preview";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Configure Parameters</h3>
          <p className="text-sm text-muted-foreground">
            Fill in the parameters for &quot;{template.name}&quot;
          </p>
        </div>
      </div>

      {/* Parameter fields */}
      <div className="space-y-4 max-w-lg">
        {template.parameters.map((param) => (
          <div key={param.key} className="space-y-1.5">
            <Label htmlFor={param.key}>
              {param.label}
              {param.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {param.description && (
              <p className="text-xs text-muted-foreground">{param.description}</p>
            )}
            <ParameterField
              param={param}
              value={values[param.key]}
              onChange={(val) => updateValue(param.key, val)}
            />
          </div>
        ))}
      </div>

      {/* Live Rego preview */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Rego Preview</h4>
        <pre className="rounded-md bg-muted/50 p-3 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto border">
          {previewRego}
        </pre>
      </div>

      {/* Navigation */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!isValid}>
          Next
        </Button>
      </div>
    </div>
  );
}
