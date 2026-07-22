-- Vendor discovery (#255) + public vendor profile (#256): adds searchable/public-facing
-- profile fields to sc_organizations. All nullable -- existing rows (and Client orgs, which
-- never populate these) are unaffected. public_slug is unique so it can back a logged-out
-- SEO-indexable profile URL (e.g. /marketplace/vendors/<slug>).

ALTER TABLE sc_organizations
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS categories text[],
  ADD COLUMN IF NOT EXISTS skills text[],
  ADD COLUMN IF NOT EXISTS price_band_min real,
  ADD COLUMN IF NOT EXISTS price_band_max real,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS public_slug text;

DO $$ BEGIN
  ALTER TABLE sc_organizations ADD CONSTRAINT sc_organizations_public_slug_unique UNIQUE (public_slug);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
