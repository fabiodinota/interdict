/**
 * Vendor Schema
 *
 * Vendors and per-vendor model version control.
 * Granular per-model status (approved/blocked) per CONTEXT.md decisions.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** AI vendor registry */
export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("approved"), // 'approved' | 'blocked'
  baseUrl: varchar("base_url", { length: 1024 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Per-vendor model version allowlist */
export const vendorModels = pgTable(
  "vendor_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    modelName: varchar("model_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("approved"), // 'approved' | 'blocked'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("vendor_model_unique").on(table.vendorId, table.modelName),
  ]
);
