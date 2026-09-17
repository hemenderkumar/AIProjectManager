-- Adds the investor-pitch fields for the Financial Forecast & Projections stage
-- (formerly "Business Case"): an executive summary, quantified market sizing
-- (TAM/SAM/SOM), and competitive differentiation.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-investor-pitch-fields.sql

-- market_size_tam/sam/som are `real` (not integer) to match every other dollar field on this
-- table (quoted_unit_price, total_funding_required, material_cost_estimate) and because TAM
-- routinely exceeds the ~2.1B ceiling of a Postgres integer column.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS business_case_executive_summary text,
  ADD COLUMN IF NOT EXISTS market_size_tam real,
  ADD COLUMN IF NOT EXISTS market_size_sam real,
  ADD COLUMN IF NOT EXISTS market_size_som real,
  ADD COLUMN IF NOT EXISTS competitive_differentiation text;
