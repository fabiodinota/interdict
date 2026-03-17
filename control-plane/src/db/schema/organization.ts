/**
 * Organization Schema
 *
 * Departments, teams, and users.
 * Included in Phase 5 schema to avoid migrations later,
 * even though department-scoped policy enforcement arrives in Phase 6.
 * RBAC enforcement deferred to Phase 7; role column for forward compatibility.
 */

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/** Department hierarchy (self-referencing for parent/child) */
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  parentDepartmentId: uuid("parent_department_id").references((): AnyPgColumn => departments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Teams within departments */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("team_department_unique").on(table.departmentId, table.name)],
);

/** Users with RBAC role assignment and service account distinction */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  teamId: uuid("team_id").references(() => teams.id),
  externalId: varchar("external_id", { length: 255 }), // SAML subject (Phase 10)
  role: varchar("role", { length: 50 }).notNull().default("read_only_auditor"),
  isActive: boolean("is_active").notNull().default(true),
  isService: boolean("is_service").notNull().default(false), // true for service accounts
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
