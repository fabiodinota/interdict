"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RuleCondition } from "@/types/policy-templates";

const AVAILABLE_FIELDS = [
  { value: "input.request.vendor", label: "Request Vendor" },
  { value: "input.request.model", label: "Request Model" },
  { value: "input.request.token_count", label: "Request Token Count" },
  { value: "input.response.token_count", label: "Response Token Count" },
  { value: "input.request.department", label: "Department" },
  { value: "input.request.actor_identity", label: "Actor Identity" },
  { value: "input.metadata.jurisdiction", label: "Jurisdiction" },
];

const OPERATORS = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
];

interface RuleEditorProps {
  conditions: RuleCondition[];
  onChange: (conditions: RuleCondition[]) => void;
  generatedRego: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function generateConditionRego(conditions: RuleCondition[]): string {
  if (conditions.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("# Additional conditions from visual rule editor");

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const isLast = i === conditions.length - 1;

    let line = "";
    if (cond.operator === "contains") {
      line = `    contains(${cond.field}, "${cond.value}")`;
    } else if (cond.operator === "not_contains") {
      line = `    not contains(${cond.field}, "${cond.value}")`;
    } else if (["==", "!=", ">", "<", ">=", "<="].includes(cond.operator)) {
      // Determine if value is numeric
      const isNumeric = !isNaN(Number(cond.value)) && cond.value.trim() !== "";
      const regoValue = isNumeric ? cond.value : `"${cond.value}"`;
      line = `    ${cond.field} ${cond.operator} ${regoValue}`;
    }

    // For OR connectors between conditions, we wrap in separate rules
    if (!isLast && conditions[i + 1] && cond.connector === "OR") {
      line += "  # OR (next condition evaluated separately)";
    }

    lines.push(line);
  }

  return lines.join("\n");
}

export function RuleEditor({
  conditions,
  onChange,
  generatedRego,
  onNext,
  onBack,
  onSkip,
}: RuleEditorProps) {
  function addCondition() {
    const newCondition: RuleCondition = {
      id: crypto.randomUUID(),
      field: AVAILABLE_FIELDS[0].value,
      operator: "==",
      value: "",
      connector: "AND",
    };
    onChange([...conditions, newCondition]);
  }

  function removeCondition(id: string) {
    onChange(conditions.filter((c) => c.id !== id));
  }

  function updateCondition(id: string, updates: Partial<RuleCondition>) {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  const conditionRego = generateConditionRego(conditions);
  const previewRego = conditions.length > 0 ? generatedRego + conditionRego : generatedRego;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Visual Rule Editor</h3>
          <p className="text-sm text-muted-foreground">
            Add additional conditions to your policy. This step is optional.
          </p>
        </div>
      </div>

      {/* Condition rows */}
      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <div key={condition.id} className="flex items-center gap-2 flex-wrap">
            {index > 0 && (
              <Select
                value={conditions[index - 1].connector}
                onValueChange={(v) =>
                  updateCondition(conditions[index - 1].id, {
                    connector: v as "AND" | "OR",
                  })
                }
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Field */}
            <Select
              value={condition.field}
              onValueChange={(v) => updateCondition(condition.id, { field: v })}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={condition.operator}
              onValueChange={(v) =>
                updateCondition(condition.id, {
                  operator: v as RuleCondition["operator"],
                })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            <Input
              className="w-40"
              value={condition.value}
              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
              placeholder="Value"
            />

            {/* Remove button */}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeCondition(condition.id)}
              aria-label="Remove condition"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="size-4" />
          Add Condition
        </Button>
      </div>

      {/* Preview */}
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
        <Button variant="outline" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  );
}

// Export the Rego generation function for use by the wizard
export { generateConditionRego };
