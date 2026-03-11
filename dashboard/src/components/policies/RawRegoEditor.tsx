"use client";

import { useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RawRegoEditorProps {
  regoSource: string;
  policyName: string;
  policyDescription: string;
  entrypoint: string;
  onRegoChange: (rego: string) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onEntrypointChange: (entrypoint: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  isEditMode: boolean;
}

export function RawRegoEditor({
  regoSource,
  policyName,
  policyDescription,
  entrypoint,
  onRegoChange,
  onNameChange,
  onDescriptionChange,
  onEntrypointChange,
  onSubmit,
  isSubmitting,
  submitError,
  isEditMode,
}: RawRegoEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle tab key to insert tab character instead of moving focus
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const newValue = value.substring(0, start) + "    " + value.substring(end);

        onRegoChange(newValue);

        // Restore cursor position after React re-renders
        requestAnimationFrame(() => {
          textarea.selectionStart = start + 4;
          textarea.selectionEnd = start + 4;
        });
      }
    },
    [onRegoChange],
  );

  const canSubmit =
    policyName.trim() !== "" && regoSource.trim() !== "" && entrypoint.trim() !== "";

  // Compute line numbers
  const lineCount = regoSource.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Raw Rego Editor</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Write your Rego policy directly. Use the Interdict package structure with{" "}
          <code className="text-xs bg-muted px-1 rounded">package interdict.policy</code>.
        </p>
      </div>

      {/* Policy metadata fields */}
      <div className="space-y-4 max-w-lg">
        <div className="space-y-1.5">
          <Label htmlFor="raw-policy-name">
            Policy Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="raw-policy-name"
            value={policyName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Custom Enforcement Rule"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="raw-policy-description">Description</Label>
          <Input
            id="raw-policy-description"
            value={policyDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe what this policy does..."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="raw-policy-entrypoint">Entrypoint</Label>
          <Input
            id="raw-policy-entrypoint"
            value={entrypoint}
            onChange={(e) => onEntrypointChange(e.target.value)}
            placeholder="interdict/policy/verdict"
          />
        </div>
      </div>

      {/* Rego editor with line numbers */}
      <div className="rounded-md bg-zinc-900 dark:bg-zinc-950 border border-zinc-700 overflow-hidden">
        <div className="flex">
          {/* Line numbers */}
          <div className="select-none py-3 pl-3 pr-2 text-right text-xs font-mono text-zinc-500 leading-relaxed min-w-[3rem]">
            {lineNumbers.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>

          {/* Editor textarea */}
          <textarea
            ref={textareaRef}
            value={regoSource}
            onChange={(e) => onRegoChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-zinc-100 text-sm font-mono p-3 resize-none outline-none min-h-80 leading-relaxed"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={`package interdict.policy\n\nimport rego.v1\n\ndefault verdict := {"action": "allow"}\n\nverdict := {"action": "block"} if {\n    # your conditions here\n}`}
          />
        </div>
      </div>

      {/* Error display */}
      {submitError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          <p className="font-medium">Rego Validation Error</p>
          <p className="mt-1 text-xs">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isEditMode ? "Update Policy" : "Create Policy"}
        </Button>
      </div>
    </div>
  );
}
