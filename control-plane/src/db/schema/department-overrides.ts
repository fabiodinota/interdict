/**
 * Department Policy Overrides Schema
 *
 * Allows department managers to override inherited global policies
 * for their department. Mandatory policies cannot be disabled.
 * Each (departmentId, policyId) pair has at most one override.
 */

import { boolean, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { departments, users } from "./organization";
import { policies } from "./policies";

export const departmentPolicyOverrides = pgTable(
  "department_policy_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("dept_policy_override_unique").on(table.departmentId, table.policyId)],
);
