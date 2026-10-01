-- Adds deliverables.phase: ties a deliverable to the SDLC phase it belongs to (Requirements,
-- Design, Testing, UAT, Deployment, etc.), the same free-text convention tasks.phase already
-- uses, so deliverables and the tasks that produce them line up against the same lifecycle.
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/add-deliverable-phase.sql

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS phase text;

-- Backfill existing rows from their type, using the same default mapping the app now applies
-- on create (see deliverablePhaseForType in src/lib/deliverables.ts).
UPDATE deliverables SET phase = 'Requirements' WHERE phase IS NULL AND type = 'REQUIREMENTS_NFR';
UPDATE deliverables SET phase = 'Design'       WHERE phase IS NULL AND type = 'DESIGN';
UPDATE deliverables SET phase = 'Testing'      WHERE phase IS NULL AND type = 'FUNCTIONAL_TEST_SCRIPT';
UPDATE deliverables SET phase = 'UAT'          WHERE phase IS NULL AND type = 'UAT_SCRIPT';
UPDATE deliverables SET phase = 'Deployment'   WHERE phase IS NULL AND type = 'RELEASE_DOCUMENTATION';
-- OTHER-type deliverables are left with phase = NULL — there's no single sensible default for
-- a free-form "other" document; it's left for the project owner to fill in if relevant.
