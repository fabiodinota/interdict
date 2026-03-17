-- Migration 0005: Create policy_scope_assignments table
--
-- Enables per-department/team/vendor policy scoping for the distribution module.
-- A policy with no scope assignment is treated as org-wide (backward compat).
-- Referenced by distribution/server.ts for policy snapshot filtering.

CREATE TABLE IF NOT EXISTS "policy_scope_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"org_id" varchar(64) NOT NULL DEFAULT 'default',
	"dept_id" varchar(64),
	"team_id" varchar(64),
	"vendor_ids" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_scope_assignments_policy_id_policies_id_fk"
		FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "psa_policy_idx" ON "policy_scope_assignments" USING btree ("policy_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "psa_scope_idx" ON "policy_scope_assignments" USING btree ("org_id","dept_id","team_id");
