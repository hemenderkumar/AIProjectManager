-- Statement of Work (SOW) module: the formal contract between the company and a vendor for
-- a project (scope, deliverables summary, timeline, funding, risks, issues, status, and the
-- full AI-drafted/edited document text). Optionally linked to a vendor already evaluated
-- through the RFP module.
DO $$ BEGIN
  CREATE TYPE sow_status AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'COMPLETED', 'TERMINATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sows (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfp_vendor_id text REFERENCES rfp_vendors(id) ON DELETE SET NULL,
  title text NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact_name text,
  vendor_contact_email text,
  status sow_status NOT NULL DEFAULT 'DRAFT',
  scope text,
  deliverables_summary text,
  timeline text,
  funding_amount real,
  funding_terms text,
  risks text,
  issues text,
  content text,
  created_by_ai boolean NOT NULL DEFAULT false,
  signed_by text,
  signed_at timestamp,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Lets an SOW's contractual milestones show up in the project's existing Milestones tab
-- (one shared list) instead of a separate SOW-only milestones concept.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS sow_id text REFERENCES sows(id) ON DELETE CASCADE;

-- Deliverables module: AI-generated working documents attached to a project (requirements/
-- NFR, design, functional test script, UAT script, release documentation, or other).
DO $$ BEGIN
  CREATE TYPE deliverable_type AS ENUM ('REQUIREMENTS_NFR', 'DESIGN', 'FUNCTIONAL_TEST_SCRIPT', 'UAT_SCRIPT', 'RELEASE_DOCUMENTATION', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deliverable_status AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'FINAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS deliverables (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type deliverable_type NOT NULL,
  title text NOT NULL,
  content text,
  status deliverable_status NOT NULL DEFAULT 'DRAFT',
  created_by_ai boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Executable test cases for a FUNCTIONAL_TEST_SCRIPT or UAT_SCRIPT deliverable: AI-generated
-- initially, then actually run by the team (actual_result/status/executed_by/executed_at
-- filled in as each one is executed).
DO $$ BEGIN
  CREATE TYPE test_case_status AS ENUM ('NOT_RUN', 'PASS', 'FAIL', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS deliverable_test_cases (
  id text PRIMARY KEY,
  deliverable_id text NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  scenario text NOT NULL,
  steps text,
  expected_result text,
  actual_result text,
  status test_case_status NOT NULL DEFAULT 'NOT_RUN',
  executed_by text,
  executed_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);
