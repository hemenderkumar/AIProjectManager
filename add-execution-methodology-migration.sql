-- Execution methodology (Waterfall/Scrum/Hybrid), SDLC phase tracking, sprints, and the
-- technical recommendation + Enterprise Architect review + expanded charter fields. Run
-- once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE execution_methodology AS ENUM ('WATERFALL', 'SCRUM', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE technical_review_status AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sprint_status AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS execution_methodology execution_methodology NOT NULL DEFAULT 'WATERFALL';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS recommended_technology text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_recommendation_rationale text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_review_status technical_review_status;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_reviewed_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_reviewed_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_review_notes text;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS high_level_requirements text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_diagram text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS internal_support_needs text;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS story_points real;

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date timestamp,
  end_date timestamp,
  status sprint_status NOT NULL DEFAULT 'PLANNED',
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id) ON DELETE SET NULL;
