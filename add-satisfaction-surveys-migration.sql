-- Adds satisfaction_surveys: client-side sentiment (NPS/CSAT) sent via a no-login tokenized
-- link, same shape as status_requests but a distinct table since a satisfaction response isn't
-- a status update -- see the comment on satisfactionSurveys in schema.ts. Idempotent: safe to
-- run more than once.

DO $$ BEGIN
  CREATE TYPE satisfaction_survey_trigger AS ENUM ('MILESTONE', 'PROJECT_CLOSE', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE satisfaction_survey_status AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS satisfaction_surveys (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_type satisfaction_survey_trigger NOT NULL DEFAULT 'MANUAL',
  milestone_id text REFERENCES milestones(id) ON DELETE SET NULL,
  status satisfaction_survey_status NOT NULL DEFAULT 'PENDING',
  respondent_name text,
  respondent_email text,
  nps_score integer,
  csat_score integer,
  comments text,
  sent_by text NOT NULL,
  sent_at timestamp NOT NULL DEFAULT now(),
  responded_at timestamp
);
