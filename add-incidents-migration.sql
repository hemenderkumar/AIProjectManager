-- Adds the Ongoing Support incident/issue queue (portfolio-wide, optionally linked to a
-- project). Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity priority NOT NULL DEFAULT 'MEDIUM',
  status incident_status NOT NULL DEFAULT 'OPEN',
  reported_by text,
  assignee text,
  reported_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  resolution_notes text,
  ai_recommendation text,
  created_at timestamp NOT NULL DEFAULT now()
);
