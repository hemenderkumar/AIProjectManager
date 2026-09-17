-- Adds market_size_by_region to projects: a directional Global/USA/regional breakdown of the
-- TAM already captured in market_size_tam. Unlike TAM/SAM/SOM, this one IS AI-draftable (see
-- src/lib/businessCaseDraft.ts) -- it's a reasoned split of a PM-entered total, not an invented
-- figure, always framed as an estimate for the PM to review before it reaches an investor.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-market-size-by-region.sql

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS market_size_by_region text;
