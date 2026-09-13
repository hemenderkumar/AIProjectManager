-- Migration: business_expenses (Executa's own operating expenses -- payroll, contractors,
-- infrastructure, etc. -- for internal profitability reporting. See lib/finance.ts).
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE "public"."business_expense_category" AS ENUM (
    'PAYROLL', 'CONTRACTOR', 'INFRASTRUCTURE', 'TOOLING', 'MARKETING', 'LEGAL_AND_ADMIN', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "business_expenses" (
  "id" text PRIMARY KEY NOT NULL,
  "category" "business_expense_category" NOT NULL,
  "payee_name" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'usd',
  "expense_date" timestamp NOT NULL,
  "is_recurring" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
