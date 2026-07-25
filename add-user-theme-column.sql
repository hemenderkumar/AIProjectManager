-- Run this once against your production database for the "theme follows your account,
-- not the browser" feature. One new column on users, defaulted to 'indigo' so every
-- existing account keeps the theme it currently sees. Safe to run any time.

ALTER TABLE "users" ADD COLUMN "theme" text NOT NULL DEFAULT 'indigo';
