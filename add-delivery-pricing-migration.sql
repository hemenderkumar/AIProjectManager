-- Delivery model & pricing: configurable rate cards (role + sourcing type), a resource's
-- sourcing type, per-project pricing model/fixed-bid fields, and the delivery role-mix
-- breakdown table. Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE sourcing_type AS ENUM ('ONSITE', 'OFFSHORE', 'CONTRACTOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_model AS ENUM ('FIXED_BID', 'TIME_AND_MATERIALS', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE resources ADD COLUMN IF NOT EXISTS sourcing_type sourcing_type;

CREATE TABLE IF NOT EXISTS rate_cards (
  id text PRIMARY KEY,
  role text NOT NULL,
  sourcing_type sourcing_type NOT NULL DEFAULT 'ONSITE',
  hourly_rate real NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE rate_cards ADD CONSTRAINT rate_card_role_sourcing_uq UNIQUE (role, sourcing_type);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pricing_model pricing_model;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fixed_bid_price real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_rationale text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_recommended_at timestamp;

CREATE TABLE IF NOT EXISTS delivery_role_mix (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL,
  hours real NOT NULL DEFAULT 0,
  onsite_percent real NOT NULL DEFAULT 100,
  offshore_percent real NOT NULL DEFAULT 0,
  contractor_percent real NOT NULL DEFAULT 0,
  rationale text,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
