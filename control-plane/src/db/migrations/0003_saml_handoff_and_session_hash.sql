-- Migration 0003: session token hashing (MED-006) + SAML handoff codes table (CRIT-002)
--
-- MED-006: rename sessions.token -> sessions.token_hash
--   Stores SHA-256 hex digest (64 chars) instead of raw token.
--   Raw token returned to caller only; never stored.
--
-- CRIT-002: saml_handoff_codes for one-time code exchange
--   Replaces ?token= in SAML callback URL with a short-lived opaque code.
--   Code is single-use (60s TTL, used=true after exchange).

-- Rename and resize the token column
ALTER TABLE "sessions" RENAME COLUMN "token" TO "token_hash";
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "token_hash" TYPE varchar(64);
--> statement-breakpoint

-- Recreate the unique constraint with the new column name
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_token_unique";
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash");
--> statement-breakpoint

-- Recreate the index with the new column name
DROP INDEX IF EXISTS "sessions_token_idx";
--> statement-breakpoint
CREATE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");
--> statement-breakpoint

-- SAML one-time handoff codes
CREATE TABLE "saml_handoff_codes" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"session_token" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saml_handoff_codes" ADD CONSTRAINT "saml_handoff_codes_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "saml_handoff_codes_expires_idx" ON "saml_handoff_codes" USING btree ("expires_at");
