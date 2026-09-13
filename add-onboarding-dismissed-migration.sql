-- Task #409: Onboarding checklist / in-app discoverability.
-- Idempotent -- safe to run against a database that already has this column.

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamp;
