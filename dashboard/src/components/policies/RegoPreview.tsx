"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Basic Rego syntax highlighting (keywords, strings, comments)
function highlightRego(source: string): React.ReactNode[] {
  const lines = source.split("\n");
  return lines.map((line, i) => {
    const highlighted = line;

    // Comments
    if (highlighted.trimStart().startsWith("#")) {
      return (
        <div key={i} className="text-muted-foreground italic">
          {highlighted}
        </div>
      );
    }

    // Simple keyword/string highlighting with spans
    const parts: React.ReactNode[] = [];
    const remaining = highlighted;
    let partIdx = 0;

    // Match keywords, strings, numbers
    const regex =
      /(package|import|default|if|not|in|some|with|as|else|every|contains)\b|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(remaining)) !== null) {
      // Plain text before match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`${i}-${partIdx++}`}>{remaining.slice(lastIndex, match.index)}</span>,
        );
      }

      if (match[1]) {
        // Keyword
        parts.push(
          <span key={`${i}-${partIdx++}`} className="text-blue-500 font-semibold">
            {match[0]}
          </span>,
        );
      } else if (match[2]) {
        // String
        parts.push(
          <span key={`${i}-${partIdx++}`} className="text-green-600 dark:text-green-400">
            {match[0]}
          </span>,
        );
      } else if (match[3]) {
        // Number
        parts.push(
          <span key={`${i}-${partIdx++}`} className="text-amber-600 dark:text-amber-400">
            {match[0]}
          </span>,
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Remaining text
    if (lastIndex < remaining.length) {
      parts.push(<span key={`${i}-${partIdx++}`}>{remaining.slice(lastIndex)}</span>);
    }

    return (
      <div key={i} className="leading-relaxed">
        {parts.length > 0 ? parts : highlighted}
      </div>
    );
  });
}

interface RegoPreviewProps {
  regoSource: string;
  policyName: string;
  policyDescription: string;
  entrypoint: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onEntrypointChange: (entrypoint: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  isEditMode: boolean;
}

export function RegoPreview({
  regoSource,
  policyName,
  policyDescription,
  entrypoint,
  onNameChange,
  onDescriptionChange,
  onEntrypointChange,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
  isEditMode,
}: RegoPreviewProps) {
  const canSubmit =
    policyName.trim() !== "" && regoSource.trim() !== "" && entrypoint.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Review & Submit</h3>
          <p className="text-sm text-muted-foreground">
            Review the generated Rego policy and provide a name before submitting.
          </p>
        </div>
      </div>

      {/* Policy metadata fields */}
      <div className="space-y-4 max-w-lg">
        <div className="space-y-1.5">
          <Label htmlFor="policy-name">
            Policy Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="policy-name"
            value={policyName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., Block OpenAI Vendor"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="policy-description">Description</Label>
          <Textarea
            id="policy-description"
            value={policyDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe what this policy does..."
            className="min-h-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="policy-entrypoint">Entrypoint</Label>
          <Input
            id="policy-entrypoint"
            value={entrypoint}
            onChange={(e) => onEntrypointChange(e.target.value)}
            placeholder="interdict/policy/verdict"
          />
          <p className="text-xs text-muted-foreground">
            The Rego entrypoint path for policy evaluation.
          </p>
        </div>
      </div>

      {/* Rego source code display */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Rego Source</h4>
        <div className="rounded-md bg-zinc-900 dark:bg-zinc-950 p-4 text-sm font-mono overflow-x-auto max-h-96 overflow-y-auto border border-zinc-700">
          <div className="text-zinc-100">{highlightRego(regoSource)}</div>
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isEditMode ? "Update Policy" : "Create Policy"}
        </Button>
      </div>
    </div>
  );
}
