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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("review_items_status_sla_idx").on(table.status, table.slaDeadline),
    index("review_items_bundle_idx").on(table.bundleId),
  ]
);
