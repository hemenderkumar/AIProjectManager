-- Adds Sprint Planning + Sprint Review ceremony artifacts (see src/lib/db/schema.ts:
-- sprintPlannings / sprintReviews), completing the four point-in-time Scrum ceremonies
-- alongside the existing standup_entries / sprint_retrospectives tables.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-sprint-planning-and-review.sql

CREATE TABLE IF NOT EXISTS sprint_plannings (
  id text PRIMARY KEY,
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  planned_points real,
  notes text,
  updated_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE UNIQUE INDEX sprint_planning_uq ON sprint_plannings (sprint_id);
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sprint_reviews (
  id text PRIMARY KEY,
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  demo_notes text,
  stakeholder_feedback text,
  updated_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE UNIQUE INDEX sprint_review_uq ON sprint_reviews (sprint_id);
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;
