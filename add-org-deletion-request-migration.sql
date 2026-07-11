-- Data export & deletion self-service (Request -> Admin confirms flow).
-- Run this against your production database after the multi-tenancy migration.
-- Safe to re-run: guards with IF NOT EXISTS / column-existence checks are not needed here
-- since these are new nullable columns, but they're written idempotently anyway.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deletion_requested_by" text;
