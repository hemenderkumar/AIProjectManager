-- Adds hiring_requisitions: a forward-looking staffing plan item, distinct from the reactive
-- Skill Capacity Forecast (which only reports a gap that already exists). Opening a
-- requisition records that someone is actively being sourced for a skill -- see the comment on
-- hiringRequisitions in schema.ts for the full reasoning. Internal-only, not tied to a project.
-- Idempotent: safe to run more than once.

DO $$ BEGIN
  CREATE TYPE hiring_requisition_status AS ENUM ('OPEN', 'INTERVIEWING', 'OFFER_EXTENDED', 'FILLED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS hiring_requisitions (
  id text PRIMARY KEY,
  skill text NOT NULL,
  role text,
  target_headcount integer NOT NULL DEFAULT 1,
  sourcing_type sourcing_type,
  status hiring_requisition_status NOT NULL DEFAULT 'OPEN',
  target_start_date timestamp,
  notes text,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  filled_by_resource_id text REFERENCES resources(id) ON DELETE SET NULL,
  filled_at timestamp
);
