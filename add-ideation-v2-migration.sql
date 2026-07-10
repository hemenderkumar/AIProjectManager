-- Ideation redesign: idea origin type, internal ideation status, a running brainstorm
-- log, and a solution-options comparison table. Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE idea_type AS ENUM ('OPPORTUNITY', 'PROBLEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ideation_status AS ENUM ('EXPLORING', 'COMPARING_OPTIONS', 'READY_FOR_CHARTER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_type idea_type;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ideation_status ideation_status NOT NULL DEFAULT 'EXPLORING';

DO $$ BEGIN
  CREATE TYPE brainstorm_entry_source AS ENUM ('AI', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS brainstorm_entries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source brainstorm_entry_source NOT NULL DEFAULT 'MANUAL',
  author text,
  content text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_options (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  pros text,
  cons text,
  feasibility_notes text,
  is_selected boolean NOT NULL DEFAULT false,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
