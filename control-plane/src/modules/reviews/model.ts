/**
 * Reviews Module - TypeBox Schemas
 *
 * Type definitions for human review queue endpoints:
 * queue listing, claim, resolve, and review item detail.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// Query Parameters
// ---------------------------------------------------------------------------

/** GET /queue query parameters */
export const ReviewQueueParams = t.Object({
  status: t.Optional(t.Union([t.Literal("pending"), t.Literal("claimed"), t.Literal("all")])),
  cursor: t.Optional(t.String({ maxLength: 255 })),
  page_size: t.Optional(t.Number({ minimum: 1, maximum: 200, default: 50 })),
});

// ---------------------------------------------------------------------------
// Request Bodies
// ---------------------------------------------------------------------------

/** POST /:id/resolve body */
export const ResolveReviewBody = t.Object({
  resolution: t.Union([
    t.Literal("false_positive"),
    t.Literal("violation_confirmed"),
    t.Literal("needs_policy_update"),
    t.Literal("insufficient_context"),
  ]),
  resolution_notes: t.String({ minLength: 10, maxLength: 5_000 }),
});

// ---------------------------------------------------------------------------
// Allowed Resolutions
// ---------------------------------------------------------------------------

export const ALLOWED_RESOLUTIONS = [
  "false_positive",
  "violation_confirmed",
  "needs_policy_update",
  "insufficient_context",
] as const;

// ---------------------------------------------------------------------------
// Response Interfaces
// ---------------------------------------------------------------------------

/** Enriched review item (Postgres row + ClickHouse bundle details) */
export interface ReviewItemResponse {
  id: string;
  bundleId: string;
  escalatedAt: string;
  slaDeadline: string;
  status: string;
  claimedBy: string | null;
  claimedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionNotes: string | null;
  /** Source of escalation: "kernel_l3" | "session_pattern" | null (legacy) */
  escalationSource: string | null;
  // Enriched from ClickHouse
  actorIdentity: string;
  vendor: string;
  model: string;
  policyAction: string;
  policyRules: unknown[];
  riskScore: number;
  promptHash: string;
  responseHash: string;
}

/** ClickHouse evidence bundle row for escalated items */
export interface EscalatedBundleRow {
  bundle_id: string;
  timestamp: string;
  actor_identity: string;
  vendor: string;
  model: string;
  policy_action: string;
  policy_rules_json: string;
  prompt_hash: string;
  response_hash: string;
  risk_score?: string;
  token_count?: number;
}
