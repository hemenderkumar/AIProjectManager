-- Run this once against your production database for the "no downloads until admin
-- approval" feature. One new nullable column on users, defaulted to now() so every
-- existing account (and every other account-creation path) is treated as already
-- verified. Safe to run any time.

ALTER TABLE "users" ADD COLUMN "verified_at" timestamp DEFAULT now();
