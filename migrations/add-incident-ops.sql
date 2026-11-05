-- Incident operations: SLA early warning, problem management, reporter communication.
-- Idempotent; safe to re-run. Run in the Supabase SQL editor.

DO $$ BEGIN
  CREATE TYPE problem_status AS ENUM ('INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS problems (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status problem_status NOT NULL DEFAULT 'INVESTIGATING',
  root_cause text,
  workaround text,
  runbook text,
  permanent_fix text,
  fix_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  created_by text,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reporter_email text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_warned_at timestamp;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_breached_at timestamp;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_reporter_update_at timestamp;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS problem_id text REFERENCES problems(id) ON DELETE SET NULL;

ALTER TABLE incident_updates ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sla_targets jsonb;

CREATE INDEX IF NOT EXISTS incidents_problem_id_idx ON incidents(problem_id);
