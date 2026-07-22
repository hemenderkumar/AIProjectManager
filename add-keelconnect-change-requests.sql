-- Lets a live (ACTIVE) KeelConnect Agreement's terms be revised through mutual approval
-- instead of a unilateral rewrite: one party proposes a change, a DIFFERENT party (or
-- Platform Admin) has to accept it before it's applied. Pre-ACTIVE agreements (DRAFT/SENT/
-- SIGNED) are unaffected -- edits there still apply directly, since nothing binding has been
-- attested yet.

DO $$ BEGIN
  CREATE TYPE sc_change_request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sc_agreement_change_requests (
  id text PRIMARY KEY,
  sc_agreement_id text NOT NULL REFERENCES sc_agreements(id) ON DELETE CASCADE,
  proposed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  proposed_by_org_id text REFERENCES sc_organizations(id) ON DELETE SET NULL,
  changes text NOT NULL,
  note text,
  status sc_change_request_status NOT NULL DEFAULT 'PENDING',
  created_at timestamp NOT NULL DEFAULT now(),
  decided_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp
);

CREATE INDEX IF NOT EXISTS sc_agreement_change_requests_agreement_idx
  ON sc_agreement_change_requests (sc_agreement_id);
