-- Run this once against your production database for the "instant individual access, but
-- rejectable later" registration feature. Only two new nullable columns on users; safe to
-- run any time.

ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp;
ALTER TABLE "users" ADD COLUMN "disabled_reason" text;
