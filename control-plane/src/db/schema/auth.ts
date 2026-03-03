/**
 * Auth Schema
 *
 * API keys, user-department join table, and role permissions.
 * Supports API key authentication (SHA-256 hashed), multi-department
 * membership, and configurable per-role permission grants.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users, departments } from "./organization";

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

/**
 * API key storage. Keys are stored as SHA-256 hex digests (64 chars).
 * Plaintext is shown exactly once at creation time and never stored.
 * Key prefix (e.g., "ik_live_XXXXXXXX") is stored for display/identification.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(), // SHA-256 hex
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(), // "ik_live_XXXXXXXX"
    label: varchar("label", { length: 255 }), // User-provided label (e.g., "CI pipeline")
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("api_keys_hash_idx").on(table.keyHash),
    index("api_keys_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// User-Department Join Table
// ---------------------------------------------------------------------------

/**
 * Multi-department membership for users.
 * Department Managers can belong to multiple departments.
 * Higher roles with empty department list = full visibility.
 */
export const userDepartments = pgTable(
  "user_departments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.departmentId] }),
  ],
);

// ---------------------------------------------------------------------------
// Role Permissions
// ---------------------------------------------------------------------------

/**
 * Configurable per-role permission grants.
 * Defaults loaded from seed; enterprise customers can customize via API.
 */
// ---------------------------------------------------------------------------
// Signing Keys (Ed25519 Key Rotation Registry)
// ---------------------------------------------------------------------------

/**
 * Registry of Ed25519 signing keys used by the evidence collector.
 * Only one key is active at a time; retired keys are kept for verification
 * of previously signed evidence bundles.
 */
export const signingKeys = pgTable(
  "signing_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyId: varchar("key_id", { length: 64 }).notNull().unique(), // SHA-256(pubkey)[:16] hex
    publicKeyHex: varchar("public_key_hex", { length: 128 }).notNull(), // Full Ed25519 public key hex
    isActive: boolean("is_active").notNull().default(false), // Only ONE active at a time
    activatedAt: timestamp("activated_at"),
    retiredAt: timestamp("retired_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("signing_keys_active_idx").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Role Permissions
// ---------------------------------------------------------------------------

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: varchar("role", { length: 50 }).notNull(),
    permission: varchar("permission", { length: 100 }).notNull(),
    isGranted: boolean("is_granted").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("role_permissions_role_perm_idx").on(table.role, table.permission),
  ],
);
