/**
 * Regulatory Framework Schema
 *
 * Frameworks, framework-to-policy mappings, and activation tracking.
 * Enabling a framework is additive; individual policies can be toggled off.
 */

import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { policies } from "./policies";

/** Regulatory frameworks (EU AI Act, GDPR, etc.) */
export const frameworks = pgTable("frameworks", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // e.g., 'eu-ai-act', 'gdpr'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  version: varchar("version", { length: 50 }),
  isSeeded: boolean("is_seeded").notNull().default(false), // built-in vs custom
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Maps policies to framework requirements */
export const frameworkPolicies = pgTable(
  "framework_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frameworkId: uuid("framework_id")
      .notNull()
      .references(() => frameworks.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    requirementRef: varchar("requirement_ref", { length: 255 }), // e.g., 'Article 14.1'
    requirementDescription: text("requirement_description"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("framework_policy_unique").on(table.frameworkId, table.policyId)],
);

/** Tracks framework activation/deactivation history */
export const frameworkActivations = pgTable("framework_activations", {
  id: uuid("id").primaryKey().defaultRandom(),
  frameworkId: uuid("framework_id")
    .notNull()
    .references(() => frameworks.id, { onDelete: "cascade" }),
  activatedBy: uuid("activated_by"), // FK to users (enforced in Phase 7)
  isActive: boolean("is_active").notNull().default(true),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  deactivatedAt: timestamp("deactivated_at"),
});
