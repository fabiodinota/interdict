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
