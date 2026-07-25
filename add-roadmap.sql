-- Roadmap: an on-demand, independent action a PM can run after ideas clear Feasibility --
-- not a gate in the Ideation sequence, since it looks across many ideas at once rather than
-- advancing one. Classifies each idea as a quick win vs a longer-term bet and sequences them
-- into phases, using the same "known inputs -> AI drafts a prioritized roadmap" pattern as
-- the standalone ai-strategy-blueprint lead-gen tool -- but fed by data already collected on
-- each idea (feasibility score, architecture notes, cost/effort) instead of a fresh intake.
-- Each generation creates a new roadmap row rather than overwriting the last, so a
-- portfolio's prioritization history isn't lost.

CREATE TABLE IF NOT EXISTS roadmaps (
  id text PRIMARY KEY,
  -- null = internal Executa's own portfolio roadmap; set = a specific client organization's.
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  executive_summary text,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roadmap_items (
  id text PRIMARY KEY,
  roadmap_id text NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  impact priority NOT NULL DEFAULT 'MEDIUM',
  effort priority NOT NULL DEFAULT 'MEDIUM',
  quick_win boolean NOT NULL DEFAULT false,
  rationale text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roadmap_phases (
  id text PRIMARY KEY,
  roadmap_id text NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  label text NOT NULL,
  focus text,
  actions text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS roadmap_items_roadmap_idx ON roadmap_items (roadmap_id);
CREATE INDEX IF NOT EXISTS roadmap_items_project_idx ON roadmap_items (project_id);
CREATE INDEX IF NOT EXISTS roadmap_phases_roadmap_idx ON roadmap_phases (roadmap_id);
CREATE INDEX IF NOT EXISTS roadmaps_organization_idx ON roadmaps (organization_id);
