/**
 * Organization Schema
 *
 * Departments, teams, and users.
 * Included in Phase 5 schema to avoid migrations later,
 * even though department-scoped policy enforcement arrives in Phase 6.
 * RBAC enforcement deferred to Phase 7; role column for forward compatibility.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Department hierarchy (self-referencing for parent/child) */
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  parentDepartmentId: uuid("parent_department_id"), // self-referencing FK
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
  (table) => [
    uniqueIndex("team_department_unique").on(table.departmentId, table.name),
  ]
);

/** Users (RBAC enforcement deferred to Phase 7) */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  teamId: uuid("team_id").references(() => teams.id),
  externalId: varchar("external_id", { length: 255 }), // SAML subject (Phase 7)
  role: varchar("role", { length: 50 }).notNull().default("read_only_auditor"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
