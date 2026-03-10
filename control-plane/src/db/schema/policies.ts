/**
 * Policy Schema
 *
 * Policies and policy versions with full version history.
 * Every edit creates a new version; previous versions are queryable
 * and restorable for compliance auditing.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Compilation status lifecycle: pending -> compiling -> compiled | failed */
export const compilationStatusEnum = pgEnum("compilation_status", [
  "pending",
  "compiling",
  "compiled",
  "failed",
]);

/**
 * Policies table - the current state of each named policy.
 * current_version_id points to the active policy_versions row.
 */
export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  currentVersionId: uuid("current_version_id"), // FK to policy_versions, set after first version created
  isActive: boolean("is_active").notNull().default(true),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: uuid("created_by"), // FK to users (enforced in Phase 7)
});

/**
 * Policy versions table - immutable version history.
 * Each edit creates a new row; versions are never updated.
 * Wasm stored on filesystem at wasm_path with SHA-256 hash for integrity.
 */
export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    version: integer("version").notNull(), // auto-incrementing per policy
    regoSource: text("rego_source").notNull(),
    entrypoint: varchar("entrypoint", { length: 512 }).notNull(),
    compilationStatus: compilationStatusEnum("compilation_status")
      .notNull()
      .default("pending"),
    compilationError: text("compilation_error"),
    wasmPath: varchar("wasm_path", { length: 1024 }), // filesystem path (discretion: fs + DB ref)
    wasmHash: varchar("wasm_hash", { length: 64 }), // SHA-256 hex
    wasmSizeBytes: integer("wasm_size_bytes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: uuid("created_by"), // FK to users (enforced in Phase 7)
    changeDescription: text("change_description"),
  },
  (table) => [
    uniqueIndex("policy_version_unique").on(table.policyId, table.version),
  ]
);

// ---------------------------------------------------------------------------
// Policy Scope Assignments (Phase 18)
// ---------------------------------------------------------------------------

/**
 * Maps policies to organizational scopes for hierarchy-aware distribution.
 *
 * Scope semantics (matching proto PolicyScope):
 * - org_id only → policy applies to entire organization
 * - org_id + dept_id → policy applies to a specific department
 * - org_id + dept_id + team_id → policy applies to a specific team
 * - vendor_ids (JSON array) → restrict policy to specific vendors
 *
 * A policy with NO scope assignment is treated as org-wide (backward compat).
 * A policy may have MULTIPLE assignments (e.g., applied to two departments).
 */
export const policyScopeAssignments = pgTable(
  "policy_scope_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    orgId: varchar("org_id", { length: 64 }).notNull().default("default"),
    deptId: varchar("dept_id", { length: 64 }),    // null = org-wide
    teamId: varchar("team_id", { length: 64 }),    // null = dept-wide or org-wide
    vendorIds: text("vendor_ids"),                  // JSON string array, null = all vendors
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("psa_policy_idx").on(table.policyId),
    index("psa_scope_idx").on(table.orgId, table.deptId, table.teamId),
  ],
);
