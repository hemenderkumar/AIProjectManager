-- Content templates for RFPs, SOWs, and status reports: reusable SKELETON starting-point
-- snapshots (RFP/SOW only) and named STYLE_PRESET AI instructions (all three entity types).
-- See src/lib/contentTemplates.ts and the comment above contentTemplates in schema.ts.
-- Safe to run any time -- purely additive.

DO $$ BEGIN
  CREATE TYPE content_template_entity AS ENUM ('RFP', 'SOW', 'STATUS_REPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE content_template_kind AS ENUM ('SKELETON', 'STYLE_PRESET');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS content_templates (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type content_template_entity NOT NULL,
  kind content_template_kind NOT NULL,
  name text NOT NULL,
  description text,
  snapshot jsonb NOT NULL,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE content_templates ENABLE ROW LEVEL SECURITY;
