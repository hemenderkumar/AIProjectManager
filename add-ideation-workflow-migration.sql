-- Adds fields for the expanded Ideation workflow: alignment decision, AI feasibility
-- assessment, and the Ideation -> Execution approval gate. Run once in Supabase's SQL Editor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS ideation_alignment text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS feasibility_score integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS feasibility_notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_approved_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_approved_at timestamp;
