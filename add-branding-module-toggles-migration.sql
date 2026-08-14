-- Migration: per-org custom branding (logo + brand color) + per-plan module toggles
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- organizations: branding columns
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "logo_data_url" text,
  ADD COLUMN IF NOT EXISTS "brand_color" text;

-- ---------------------------------------------------------------------------
-- plans: which optional modules a plan includes. NULL = every module enabled
-- (the default for all pre-existing rows -- see lib/modules.ts / lib/modules-server.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "enabled_modules" jsonb;
