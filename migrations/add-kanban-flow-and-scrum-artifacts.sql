-- Adds the two columns needed for Kanban flow metrics on the Sprint board (see
-- src/lib/flowMetrics.ts): tasks.started_at (cycle-time start point, set automatically the
-- first time a task's status becomes IN_PROGRESS) and projects.wip_limits (optional per-column
-- WIP limits, e.g. {"IN_PROGRESS": 5, "BLOCKED": 2}).
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-kanban-flow-metrics.sql

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS started_at timestamp;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS wip_limits jsonb;

-- Scrum Daily Standup log + Sprint Retrospective (see src/lib/db/schema.ts:
-- standupEntries / sprintRetrospectives).
CREATE TABLE IF NOT EXISTS standup_entries (
  id text PRIMARY KEY,
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  resource_id text REFERENCES resources(id) ON DELETE SET NULL,
  date timestamp NOT NULL DEFAULT now(),
  yesterday text,
  today text,
  blockers text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sprint_retrospectives (
  id text PRIMARY KEY,
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  went_well text,
  to_improve text,
  action_items text,
  updated_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE UNIQUE INDEX sprint_retro_uq ON sprint_retrospectives (sprint_id);
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

-- PRINCE2 terminology/report mode (see src/lib/prince2.ts).
DO $$ BEGIN
  CREATE TYPE terminology_mode AS ENUM ('STANDARD', 'PRINCE2');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS terminology_mode terminology_mode NOT NULL DEFAULT 'STANDARD';

ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'PRINCE2_HIGHLIGHT';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'PRINCE2_END_STAGE';
