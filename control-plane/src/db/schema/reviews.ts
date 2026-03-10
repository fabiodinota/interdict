/**
 * Reviews Schema
 *
 * Human review queue for Layer 3 escalated interactions.
 * Compliance officers claim, review, and resolve items with
 * mandatory category and reasoning. Optimistic locking on claim.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./organization";

// ---------------------------------------------------------------------------
// Review Items
// ---------------------------------------------------------------------------

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: varchar("bundle_id", { length: 255 }).notNull(),
    escalatedAt: timestamp("escalated_at").notNull(),
    slaDeadline: timestamp("sla_deadline").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | claimed | approved | rejected | auto_escalated
    claimedBy: uuid("claimed_by").references(() => users.id),
    claimedAt: timestamp("claimed_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    resolution: varchar("resolution", { length: 50 }),
    // false_positive | violation_confirmed | needs_policy_update | insufficient_context
    resolutionNotes: text("resolution_notes"),
    autoEscalatedTo: uuid("auto_escalated_to").references(() => users.id),
    /// Source of escalation: "kernel_l3" (policy pipeline) or "session_pattern"
    /// (slow-leak/exfiltration detection). NULL for legacy sync-created items.
    escalationSource: varchar("escalation_source", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("review_items_status_sla_idx").on(table.status, table.slaDeadline),
    // UNIQUE on bundle_id enforces idempotent review creation.
    // The same evidence bundle can only produce one review item.
    uniqueIndex("review_items_bundle_id_uniq").on(table.bundleId),
  ]
);
