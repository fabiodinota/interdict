"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SlaTimer } from "./SlaTimer";
import { useResolveReview } from "@/hooks/use-reviews";
import type { ReviewItem, ReviewResolution } from "@/types/api";

// ---------------------------------------------------------------------------
// Resolution category labels
// ---------------------------------------------------------------------------

const RESOLUTION_OPTIONS: { value: ReviewResolution; label: string }[] = [
  { value: "false_positive", label: "False positive" },
  { value: "violation_confirmed", label: "Policy violation confirmed" },
  { value: "needs_policy_update", label: "Needs policy update" },
  { value: "insufficient_context", label: "Insufficient context" },
];

// ---------------------------------------------------------------------------
// ReviewDialog
// ---------------------------------------------------------------------------

interface ReviewDialogProps {
  item: ReviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewDialog({ item, open, onOpenChange }: ReviewDialogProps) {
  const [resolution, setResolution] = useState<ReviewResolution | "">("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const resolveReview = useResolveReview();

  const isValid = resolution !== "" && resolutionNotes.length >= 10;
  const isSubmitting = resolveReview.isPending;

  const handleResolve = async (action: "approve" | "reject") => {
    if (!item || !resolution) return;

    // For reject, force violation_confirmed if not already selected
    const finalResolution =
      action === "reject" ? "violation_confirmed" : resolution;

    await resolveReview.mutateAsync({
      reviewId: item.id,
      resolution: finalResolution as ReviewResolution,
      resolution_notes: resolutionNotes,
    });

    // Reset and close
    setResolution("");
    setResolutionNotes("");
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setResolution("");
      setResolutionNotes("");
    }
    onOpenChange(newOpen);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Review Escalated Interaction</DialogTitle>
            <SlaTimer deadline={item.slaDeadline} />
          </div>
          <DialogDescription>
            Review the interaction details and provide your assessment with
            mandatory reasoning.
          </DialogDescription>
        </DialogHeader>

        {/* Interaction Details */}
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Interaction Details</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Bundle ID:</span>
                <p className="font-mono text-xs mt-0.5 truncate">
                  {item.bundleId}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Actor:</span>
                <p className="mt-0.5">{item.actorIdentity}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Vendor / Model:</span>
                <p className="mt-0.5">
                  {item.vendor} / {item.model}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Risk Score:</span>
                <Badge
                  variant={
                    item.riskScore > 80
                      ? "destructive"
                      : item.riskScore > 50
                        ? "default"
                        : "secondary"
                  }
                  className="mt-0.5"
                >
                  {item.riskScore}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Policy Action:</span>
                <Badge variant="outline" className="mt-0.5">
                  {item.policyAction}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="secondary" className="mt-0.5">
                  {item.status}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Cryptographic Hashes */}
          <div>
            <h4 className="text-sm font-semibold mb-2">
              Cryptographic Evidence
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Prompt Hash:</span>
                <p className="font-mono text-xs mt-0.5 break-all">
                  {item.promptHash || "N/A"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Response Hash:</span>
                <p className="font-mono text-xs mt-0.5 break-all">
                  {item.responseHash || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Policy Rules */}
          {item.policyRules && item.policyRules.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Triggering Policy Rules
                </h4>
                <div className="flex flex-wrap gap-1">
                  {item.policyRules.map((rule, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {String(rule)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Resolution Form */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Resolution</h4>

            <div className="space-y-2">
              <Label htmlFor="resolution-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={resolution}
                onValueChange={(v) => setResolution(v as ReviewResolution)}
              >
                <SelectTrigger id="resolution-category">
                  <SelectValue placeholder="Select resolution category..." />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution-notes">
                Reasoning <span className="text-destructive">*</span>
                <span className="text-muted-foreground text-xs ml-1">
                  (minimum 10 characters)
                </span>
              </Label>
              <Textarea
                id="resolution-notes"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Provide detailed reasoning for your decision..."
                rows={4}
              />
              {resolutionNotes.length > 0 && resolutionNotes.length < 10 && (
                <p className="text-xs text-destructive">
                  {10 - resolutionNotes.length} more character(s) required
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleResolve("reject")}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Reject
          </Button>
          <Button
            onClick={() => handleResolve("approve")}
            disabled={!isValid || isSubmitting}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
