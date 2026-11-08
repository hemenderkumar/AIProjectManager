-- Idea Evaluation hub: the ask, AI market research with sources, and the go/park/stop decision.
-- Idempotent; safe to re-run.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ask_decision_needed text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ask_team text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ask_timeline text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ask_if_approved text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ask_if_declined text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_research jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_researched_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_decision text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_decision_note text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_decided_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_decided_at timestamp;
