-- Adds the investor-pitch fields for the Financial Forecast & Projections stage
-- (formerly "Business Case"): an executive summary, quantified market sizing
-- (TAM/SAM/SOM), and competitive differentiation.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-investor-pitch-fields.sql

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS business_case_executive_summary text,
  ADD COLUMN IF NOT EXISTS market_size_tam integer,
  ADD COLUMN IF NOT EXISTS market_size_sam integer,
  ADD COLUMN IF NOT EXISTS market_size_som integer,
  ADD COLUMN IF NOT EXISTS competitive_differentiation text;
