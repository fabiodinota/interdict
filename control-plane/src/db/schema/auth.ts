/**
 * Auth Schema
 *
 * API keys, user-department join table, sessions, SAML handoff codes,
 * and signing keys.
 * Supports API key authentication (SHA-256 hashed), multi-department
 * membership, and SAML SSO browser sessions.
 */

import { boolean, index, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { departments, users } from "./organization";

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
  (table) => [primaryKey({ columns: [table.userId, table.departmentId] })],
);

// ---------------------------------------------------------------------------
// Sessions (SAML SSO / Browser Authentication)
// ---------------------------------------------------------------------------

/**
 * Sessions table for SAML SSO and browser-based authentication.
 * Stores SHA-256 hex digest of the raw session token (MED-006).
 * Raw token is returned to the caller once and never stored.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(), // SHA-256(raw token) hex
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// SAML Handoff Codes (CRIT-002: one-time code exchange)
// ---------------------------------------------------------------------------

/**
 * Short-lived one-time codes used during SAML callback handoff.
 * The ACS handler issues a code (60s TTL, single-use) instead of putting
 * the raw session token in the redirect URL. The dashboard exchanges the
 * code for a newly minted session token via a backchannel POST.
 *
 * SECURITY (Phase 17): Raw session tokens are NEVER stored in this table.
 * Only the userId is persisted; the session is created on-the-fly during
 * the atomic code exchange, so no bearer credential sits in Postgres.
 */
export const samlHandoffCodes = pgTable(
  "saml_handoff_codes",
  {
    code: varchar("code", { length: 64 }).primaryKey(), // 32 random bytes hex
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("saml_handoff_codes_expires_idx").on(table.expiresAt)],
);

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
  (table) => [index("signing_keys_active_idx").on(table.isActive)],
);
