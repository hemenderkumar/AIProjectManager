-- Rate Cards become per-company: organization_id = null stays Keel's own internal default
-- list (used for internal/Keel-run projects, and as a fallback for any client company that
-- hasn't set its own rates yet); non-null = that specific client company's own rates.
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE CASCADE;

-- Replace the old (role, sourcing_type) uniqueness with (organization_id, role, sourcing_type)
-- so different companies (and the null/global list) can each have their own "Backend
-- Engineer / Onsite" row without colliding.
ALTER TABLE rate_cards DROP CONSTRAINT IF EXISTS rate_card_role_sourcing_uq;
DO $$ BEGIN
  ALTER TABLE rate_cards ADD CONSTRAINT rate_card_org_role_sourcing_uq UNIQUE (organization_id, role, sourcing_type);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
