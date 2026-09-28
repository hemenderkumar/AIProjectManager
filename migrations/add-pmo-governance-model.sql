-- Adds the org-wide PMO governance model setting (Supportive / Controlling / Directive /
-- Enterprise -- see src/lib/pmoGovernance.ts) that controls how strict Ideation gate
-- approvals (Architecture, Business Case, Charter) are across every project. A single row on
-- the existing `settings` singleton, not per-project or per-client organization.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-pmo-governance-model.sql

DO $$ BEGIN
  CREATE TYPE pmo_governance_model AS ENUM ('SUPPORTIVE', 'CONTROLLING', 'DIRECTIVE', 'ENTERPRISE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS pmo_governance_model pmo_governance_model NOT NULL DEFAULT 'SUPPORTIVE';
