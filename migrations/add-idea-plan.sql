-- Idea plan: how the cost was estimated, AI cost-saving levers, partnerships, 3-year projection.
-- Idempotent; safe to re-run.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_plan jsonb;
