-- Migration: configurable no-code ticket routing for API keys (#429-433) -- lets an admin
-- set a default assignee per key from Settings > Integrations so a calling application that
-- just POSTs a bare incident title still gets routed to the right person. See lib/apiKeys.ts
-- and /api/public/v1/incidents POST.
-- Idempotent: safe to re-run.

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "default_assignee_user_id" text REFERENCES "users"("id") ON DELETE SET NULL;
