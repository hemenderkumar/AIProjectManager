-- Migration: promo code management (percent-off discounts, Stripe-backed).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."promo_scope" AS ENUM ('SPECIFIC_ORG', 'GROUP', 'GENERIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."promo_duration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- promo_codes table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "percent_off" integer NOT NULL,
  "scope" "promo_scope" NOT NULL,
  "duration" "promo_duration" NOT NULL DEFAULT 'ONCE',
  "duration_in_months" integer,
  "target_organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "group_label" text,
  "max_redemptions" integer,
  "redemption_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "stripe_coupon_id" text,
  "stripe_promotion_code_id" text,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- promo_redemptions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "promo_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "promo_code_id" text NOT NULL REFERENCES "promo_codes"("id") ON DELETE CASCADE,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE SET NULL,
  "organization_name" text,
  "stripe_checkout_session_id" text,
  "stripe_subscription_id" text,
  "redeemed_at" timestamp NOT NULL DEFAULT now()
);
