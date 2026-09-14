-- Migration: email intake routes (#434-439) -- no-code incident reporting via a dedicated
-- inbound email address per organization (Settings > Integrations). See lib/emailIntake.ts.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "email_intake_routes" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "inbound_address" text NOT NULL UNIQUE,
  "default_severity" "priority" NOT NULL DEFAULT 'MEDIUM',
  "default_assignee_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp
);

ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "created_via_email_route_id" text REFERENCES "email_intake_routes"("id") ON DELETE SET NULL;
