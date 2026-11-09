-- AI recommendation (proceed / proceed with conditions / do not proceed) with reasons.
-- Idempotent; safe to re-run.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_recommendation jsonb;
