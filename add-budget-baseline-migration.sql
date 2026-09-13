-- Adds budget_baselines (a locked, versioned snapshot of a project's approved budget) and
-- budget_change_requests (the audit trail of proposed changes against the active baseline).
-- Distinct from the existing budget_planned column on projects (a live, freely-editable
-- top-line figure) and cost_items (the itemized breakdown, editable/deletable at any time):
-- once a baseline is locked here, it's meant to be an immutable historical record. Approving a
-- change request inserts a NEW baseline row rather than mutating an old one -- see the comments
-- on both tables in schema.ts for the full reasoning. Idempotent: safe to run more than once.

DO $$ BEGIN
  CREATE TYPE budget_change_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS budget_baselines (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  total_amount real NOT NULL,
  breakdown_snapshot text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  locked_by text NOT NULL,
  locked_at timestamp NOT NULL DEFAULT now(),
  superseded_at timestamp
);

CREATE TABLE IF NOT EXISTS budget_change_requests (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_id text REFERENCES budget_baselines(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  amount_delta real NOT NULL,
  status budget_change_request_status NOT NULL DEFAULT 'PENDING',
  requested_by text NOT NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  decided_by text,
  decided_at timestamp,
  decision_notes text,
  resulting_baseline_id text REFERENCES budget_baselines(id) ON DELETE SET NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'budget_baseline_project_version_uq'
  ) THEN
    CREATE UNIQUE INDEX budget_baseline_project_version_uq ON budget_baselines (project_id, version_number);
  END IF;
END $$;

-- Keeps "exactly one active baseline per project" enforceable at the DB level too, not just by
-- application logic -- a partial unique index only ever counts rows where is_active is true.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'budget_baseline_one_active_per_project_uq'
  ) THEN
    CREATE UNIQUE INDEX budget_baseline_one_active_per_project_uq ON budget_baselines (project_id) WHERE is_active;
  END IF;
END $$;
