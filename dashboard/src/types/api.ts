// API Response Types -- matching control plane response shapes

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    nextCursor: string | null;
    total?: number;
  };
}

// Auth
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentIds: string[];
}

export type UserRole =
  | "read_only_auditor"
  | "department_manager"
  | "compliance_officer"
  | "policy_admin"
  | "super_admin";

// Policies
export interface PolicyVersion {
  id: string;
  version: number;
  rego_source: string;
  entrypoint: string | null;
  compilation_status: "pending" | "compiling" | "compiled" | "failed";
  compilation_error: string | null;
  wasm_hash: string | null;
  wasm_size_bytes: number | null;
  created_at: string;
  change_description: string | null;
}

export interface Policy {
  id: string;
  name: string;
  description: string | null;
  current_version: PolicyVersion | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Vendors
export interface Vendor {
  id: string;
  name: string;
  slug: string;
  status: "approved" | "blocked" | "pending";
  createdAt: string;
  updatedAt: string;
}

export interface VendorModel {
  id: string;
  vendorId: string;
  modelId: string;
  displayName: string;
  allowed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Regulatory
export interface RegulatoryFramework {
  id: string;
  name: string;
  jurisdiction: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Audit
export interface AuditRecord {
  id: string;
  timestamp: string;
  requestId: string;
  userId: string;
  departmentId: string;
  vendor: string;
  model: string;
  action: string;
  decision: "allow" | "block" | "redact" | "escalate";
  policyId: string | null;
  policyName: string | null;
  riskScore: number;
  responseTimeMs: number;
  metadata: Record<string, unknown>;
}

// Dashboard Stats
export interface HourlyViolation {
  hour: string;
  count: number;
  type: string;
}

export interface VendorUsage {
  vendor: string;
  requestCount: number;
  blockCount: number;
}

// ---------------------------------------------------------------------------
// Phase 11: Evidence Verification Types
// ---------------------------------------------------------------------------

export interface EvidenceBundle {
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
// Phase 11: Review Queue Types (Plan 02)
// ---------------------------------------------------------------------------

export interface ReviewItem {
  id: string;
  bundleId: string;
  escalatedAt: string;
  slaDeadline: string;
  status: "pending" | "claimed" | "approved" | "rejected" | "auto_escalated";
  claimedBy: string | null;
  claimedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionNotes: string | null;
  actorIdentity: string;
  vendor: string;
  model: string;
  policyAction: string;
  policyRules: unknown[];
  riskScore: number;
  promptHash: string;
  responseHash: string;
}

export type ReviewResolution =
  | "false_positive"
  | "violation_confirmed"
  | "needs_policy_update"
  | "insufficient_context";

// ---------------------------------------------------------------------------
// Phase 11: Department Policy Types (Plan 03)
// ---------------------------------------------------------------------------

export interface DepartmentEffectivePolicy {
  policyId: string;
  name: string;
  description: string;
  globalEnabled: boolean;
  effectiveEnabled: boolean;
  isMandatory: boolean;
  source: "Global" | "Department override";
  overrideId: string | null;
}

// ---------------------------------------------------------------------------
// Phase 11: Anomaly Detection Types (Plan 04)
// ---------------------------------------------------------------------------

export interface AnomalyAlert {
  type: "volume_spike" | "off_hours" | "vendor_switch" | "topic_drift";
  severity: "info" | "warning" | "critical";
  actorIdentity: string;
  summary: string;
  baseline: Record<string, number | string>;
  current: Record<string, number | string>;
  detectedAt: string;
  actions: Array<{ label: string; href: string }>;
}

export interface AnomalySummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  byType: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Phase 15: Signing Key Management Types
// ---------------------------------------------------------------------------

export interface SigningKeyInfo {
  id: string;
  key_id: string;
  public_key_hex: string;
  is_active: boolean;
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
}

export interface RotateKeyResult {
  key_id: string;
  public_key_hex: string;
}
