/**
 * Evidence Module - TypeBox Schemas
 *
 * Type definitions for evidence bundle verification and listing endpoints.
 */

import { t } from "elysia";

// ---------------------------------------------------------------------------
// POST /verify Request
// ---------------------------------------------------------------------------

export const VerifyBundlesBody = t.Object({
  bundle_ids: t.Array(t.String(), { maxItems: 100, minItems: 1 }),
});

// ---------------------------------------------------------------------------
// GET /bundles Query Parameters
// ---------------------------------------------------------------------------

export const BundlesQueryParams = t.Object({
  cursor: t.Optional(t.String()),
  page_size: t.Optional(t.Number({ minimum: 1, maximum: 200, default: 50 })),
  from_date: t.Optional(t.String()),
  to_date: t.Optional(t.String()),
});

// ---------------------------------------------------------------------------
// Verification Result Types
// ---------------------------------------------------------------------------

export interface VerificationStep {
  name: string;
  passed: boolean | null; // null = not available (e.g., Merkle)
  details: Record<string, string>;
}

export interface VerificationResult {
  bundleId: string;
  steps: VerificationStep[];
  overall: "pass" | "fail" | "partial";
}

// ---------------------------------------------------------------------------
// ClickHouse evidence bundle row (subset for verification)
// ---------------------------------------------------------------------------

export interface EvidenceBundleRow {
  bundle_id: string;
  kernel_id: string;
  chain_hash: string;
  previous_hash: string;
  sequence_number: number;
  signature: string;
  signing_key_id: string;
  timestamp: string;
  event_date: string;
  actor_identity: string;
  vendor: string;
  model: string;
  policy_action: string;
  department: string;
  /** Hex-encoded protobuf content bytes (bundle with chain/sig fields zeroed).
   *  May be empty for bundles stored before the content_bytes column was added. */
  content_bytes: string;
}

// ---------------------------------------------------------------------------
// Evidence bundle list item (API response)
// ---------------------------------------------------------------------------

export interface EvidenceBundleListItem {
  bundle_id: string;
  chain_hash: string;
  previous_hash: string;
  sequence_number: number;
  signature: string;
  signing_key_id: string;
  timestamp: string;
  actor_identity: string;
  vendor: string;
  policy_action: string;
}
