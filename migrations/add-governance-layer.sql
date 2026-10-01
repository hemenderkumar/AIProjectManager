-- Adds the three governance-gap features closing out the Project Governance Levels
-- infographic gap analysis (Sponsor, Steering Committee/Escalations, Portfolio Board):
--   1. approval_requests -- tokenized no-login Sponsor approval (same pattern as
--      status_requests / rfp_vendors: the token is the entire security boundary).
--   2. escalations -- real tracked "needs committee-level help" items, now fed into the
--      steering committee report instead of being purely AI-inferred.
--   3. portfolio_decisions -- an append-only Portfolio Board decision log (FUND/DEFER/
--      HOLD/KILL) per project.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-governance-layer.sql

DO $$ BEGIN
  CREATE TYPE approval_entity_type AS ENUM ('CHARTER', 'BUDGET_CHANGE_REQUEST', 'GENERAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type approval_entity_type NOT NULL DEFAULT 'GENERAL',
  entity_id text,
  sponsor_stakeholder_id text NOT NULL REFERENCES stakeholders(id) ON DELETE CASCADE,
  token text NOT NULL,
  status approval_status NOT NULL DEFAULT 'PENDING',
  summary text,
  decision_note text,
  requested_by text NOT NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  decided_at timestamp
);

DO $$ BEGIN
  CREATE UNIQUE INDEX approval_requests_token_uq ON approval_requests (token);
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE escalation_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS escalations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity priority NOT NULL DEFAULT 'HIGH',
  status escalation_status NOT NULL DEFAULT 'OPEN',
  owner text,
  raised_by text NOT NULL,
  linked_risk_id text REFERENCES risk_items(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  resolution text
);

DO $$ BEGIN
  CREATE TYPE portfolio_decision_type AS ENUM ('FUND', 'DEFER', 'HOLD', 'KILL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS portfolio_decisions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  decision_type portfolio_decision_type NOT NULL,
  budget_requested real,
  budget_approved real,
  rationale text,
  decided_by text NOT NULL,
  decided_at timestamp NOT NULL DEFAULT now()
);
