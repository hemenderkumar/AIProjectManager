-- Migration: subscription billing (trial + plans + Stripe)
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- New enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- plans table (admin-managed pricing tiers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "plans" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "stripe_price_id" text,
  "price_cents" integer,
  "billing_interval" text NOT NULL DEFAULT 'month',
  "billing_model" text NOT NULL DEFAULT 'flat',
  "project_limit" integer,
  "seat_limit" integer,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- organizations: billing columns
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp,
  ADD COLUMN IF NOT EXISTS "subscription_status" "subscription_status" NOT NULL DEFAULT 'TRIALING',
  ADD COLUMN IF NOT EXISTS "plan_id" text REFERENCES "plans"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text,
  ADD COLUMN IF NOT EXISTS "billing_comped_by_admin" boolean NOT NULL DEFAULT false;

-- Grandfather every organization that existed before this migration: mark them ACTIVE
-- (subscriptionStatus default is TRIALING with a null trialEndsAt, and isOrgBillingBlocked()
-- treats a null trialEndsAt as unblocked -- but setting ACTIVE explicitly here is clearer and
-- matches the "existing org.created_at is before this migration" reality) so nobody currently
-- using the app gets locked out by a trial deadline they never agreed to.
UPDATE "organizations" SET "subscription_status" = 'ACTIVE' WHERE "trial_ends_at" IS NULL;

-- ---------------------------------------------------------------------------
-- settings: admin-configurable trial length
-- ---------------------------------------------------------------------------
ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "trial_days" integer NOT NULL DEFAULT 14;
