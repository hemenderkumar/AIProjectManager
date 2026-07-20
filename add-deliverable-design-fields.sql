-- Run this once against your production database. Adds four structured, DESIGN-deliverable-
-- only fields (broken out of the single "content" blob so AI can fill each in separately and
-- the user can edit each independently): component list, architecture highlights, pros, cons.
-- Nullable and unused for every other deliverable type.

ALTER TABLE "deliverables" ADD COLUMN "component_list" text;
ALTER TABLE "deliverables" ADD COLUMN "architecture_highlights" text;
ALTER TABLE "deliverables" ADD COLUMN "pros" text;
ALTER TABLE "deliverables" ADD COLUMN "cons" text;
