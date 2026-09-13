-- Migration: financial snapshot fields on promo_redemptions (promo tracking + financial
-- reporting -- see getPromoFinancialSummary in lib/promo.ts).
-- Idempotent: safe to re-run. Depends on add-promo-codes-migration.sql having already run.

ALTER TABLE "promo_redemptions"
  ADD COLUMN IF NOT EXISTS "amount_discounted_cents" integer,
  ADD COLUMN IF NOT EXISTS "subscription_amount_cents" integer,
  ADD COLUMN IF NOT EXISTS "currency" text,
  ADD COLUMN IF NOT EXISTS "plan_name" text;
