-- Roadmap "Revise with AI": a revision produces a brand-new roadmaps row (full history kept,
-- nothing overwritten) linked back to the one it revised, plus the free-text instruction that
-- drove the change -- so the sidebar list can show "revision of <date>: <instruction>".

ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS revised_from_roadmap_id text REFERENCES roadmaps(id) ON DELETE SET NULL;
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS revision_instruction text;

CREATE INDEX IF NOT EXISTS roadmaps_revised_from_idx ON roadmaps (revised_from_roadmap_id);
