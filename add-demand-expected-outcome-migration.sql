-- Adds the optional "expected outcome" field to demand requests, split out from the
-- required "description" (business problem) field on the public /demand-request form.
-- Idempotent: safe to run more than once.
ALTER TABLE "demand_requests" ADD COLUMN IF NOT EXISTS "expected_outcome" text;
