-- Adds a lighter-weight "Resource Request" posting type to KeelConnect (e.g. "need 2 senior
-- React developers for 3 months") alongside the existing full Project posting. Deliberately
-- reuses sc_projects/sc_bids/negotiations/agreements/milestones/payments/reviews rather than
-- a parallel table set -- a Vendor "bids" a proposed rate on a Resource Request exactly the
-- way they'd bid a price on a Project. request_type defaults to PROJECT so every existing
-- row is unaffected.

DO $$ BEGIN
  CREATE TYPE sc_request_type AS ENUM ('PROJECT', 'RESOURCE_REQUEST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sc_rate_type AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'FIXED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE sc_projects
  ADD COLUMN IF NOT EXISTS request_type sc_request_type NOT NULL DEFAULT 'PROJECT',
  ADD COLUMN IF NOT EXISTS skills_required text[],
  ADD COLUMN IF NOT EXISTS duration_weeks integer,
  ADD COLUMN IF NOT EXISTS rate_type sc_rate_type;
