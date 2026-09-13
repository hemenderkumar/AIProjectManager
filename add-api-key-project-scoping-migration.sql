-- Migration: project-specific API keys (#422-425) -- lets a key be restricted to one
-- project instead of the whole org, and records which key created an incident for
-- audit/traceability. See lib/apiKeys.ts.
-- Idempotent: safe to re-run.

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "project_id" text REFERENCES "projects"("id") ON DELETE CASCADE;

ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "created_via_api_key_id" text REFERENCES "api_keys"("id") ON DELETE SET NULL;
