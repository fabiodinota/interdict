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
export interface Policy {
  id: string;
  name: string;
  description: string;
  category: string;
  regoSource: string;
  wasmHash: string | null;
  enabled: boolean;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: number;
  regoSource: string;
  wasmHash: string | null;
  changeDescription: string | null;
  createdBy: string;
  createdAt: string;
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
