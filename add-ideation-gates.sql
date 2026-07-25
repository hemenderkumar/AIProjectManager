-- Run this once against your production database for the gated Plan sequence (Idea &
-- Alignment -> Technical Feasibility -> Architecture -> Scope & Charter -> Resourcing
-- Decision). Creates 3 new enum types, 9 new columns on projects, and a new
-- idea_reviewers table, then grandfathers projects already past IDEATION straight to
-- READY_FOR_EXECUTION so nothing already in flight gets retroactively gated.

CREATE TYPE "ideation_sub_stage" AS ENUM (
  'IDEA_ALIGNMENT',
  'TECHNICAL_FEASIBILITY',
  'ARCHITECTURE_REVIEW',
  'CHARTER',
  'RESOURCING_DECISION',
  'READY_FOR_EXECUTION'
);

CREATE TYPE "idea_review_decision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

CREATE TYPE "delivery_mode" AS ENUM ('INTERNAL', 'VENDOR');

ALTER TABLE "projects" ADD COLUMN "ideation_sub_stage" "ideation_sub_stage" NOT NULL DEFAULT 'IDEA_ALIGNMENT';
ALTER TABLE "projects" ADD COLUMN "idea_confirmed_at" timestamp;
ALTER TABLE "projects" ADD COLUMN "current_tech_landscape" text;
ALTER TABLE "projects" ADD COLUMN "architecture_pros_cons" text;
ALTER TABLE "projects" ADD COLUMN "architecture_approved_by" text;
ALTER TABLE "projects" ADD COLUMN "architecture_approved_at" timestamp;
ALTER TABLE "projects" ADD COLUMN "architecture_review_notes" text;
ALTER TABLE "projects" ADD COLUMN "delivery_mode" "delivery_mode";
ALTER TABLE "projects" ADD COLUMN "delivery_mode_decided_by" text;
ALTER TABLE "projects" ADD COLUMN "delivery_mode_decided_at" timestamp;

CREATE TABLE "idea_reviewers" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_by" text,
  "invited_at" timestamp NOT NULL DEFAULT now(),
  "decision" "idea_review_decision" NOT NULL DEFAULT 'PENDING',
  "comment" text,
  "responded_at" timestamp,
  CONSTRAINT "idea_reviewer_uq" UNIQUE ("project_id", "user_id")
);

-- Grandfather: any project already past IDEATION (i.e. sitting at CHARTER or later) skips
-- straight to READY_FOR_EXECUTION so it isn't retroactively locked out of a step it never
-- went through. Projects still at INCEPTION/IDEATION keep the column's default
-- (IDEA_ALIGNMENT) and go through the new gated sequence from here.
UPDATE "projects" SET "ideation_sub_stage" = 'READY_FOR_EXECUTION' WHERE "stage" IN ('CHARTER', 'EXECUTION', 'CLOSING', 'CLOSED');
