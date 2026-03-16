-- Migration 0004: Department self-referencing FK + drop dead role_permissions table
--
-- 1. Add FK constraint on departments.parent_department_id → departments.id
--    Uses ON DELETE SET NULL to avoid recursive cascade deletion of department subtrees.
--
-- 2. Drop the role_permissions table (dead code — permissions are enforced in-memory
--    via DEFAULT_PERMISSIONS in permissions.ts, never queried from this table).

ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_department_id_departments_id_fk"
	FOREIGN KEY ("parent_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

DROP INDEX IF EXISTS "role_permissions_role_perm_idx";
--> statement-breakpoint

DROP TABLE "role_permissions";
