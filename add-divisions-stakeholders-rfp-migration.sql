-- Structured sponsor mapping (divisions + stakeholders) and the Vendor Evaluation (RFP)
-- module. Run this against your production database after the earlier migrations.

CREATE TABLE IF NOT EXISTS "divisions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "division_org_name_uq" UNIQUE ("organization_id", "name")
);

CREATE TABLE IF NOT EXISTS "stakeholders" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "title" text,
  "email" text,
  "division_id" text REFERENCES "divisions"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "division_id" text REFERENCES "divisions"("id") ON DELETE SET NULL;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "sponsor_stakeholder_id" text REFERENCES "stakeholders"("id") ON DELETE SET NULL;

-- Vendor Evaluation (RFP) module
DO $$ BEGIN
  CREATE TYPE "rfp_status" AS ENUM ('DRAFT', 'PUBLISHED', 'EVALUATING', 'AWARDED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "vendor_response_status" AS ENUM ('INVITED', 'VIEWED', 'SUBMITTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "rfps" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "status" "rfp_status" NOT NULL DEFAULT 'DRAFT',
  "background" text,
  "scope" text,
  "requirements" text,
  "timeline" text,
  "budget_range" text,
  "content" text,
  "created_by_ai" boolean NOT NULL DEFAULT false,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "published_at" timestamp
);

CREATE TABLE IF NOT EXISTS "rfp_criteria" (
  "id" text PRIMARY KEY NOT NULL,
  "rfp_id" text NOT NULL REFERENCES "rfps"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "weight_percent" real NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "rfp_vendors" (
  "id" text PRIMARY KEY NOT NULL,
  "rfp_id" text NOT NULL REFERENCES "rfps"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "contact_name" text,
  "contact_email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "status" "vendor_response_status" NOT NULL DEFAULT 'INVITED',
  "invited_at" timestamp NOT NULL DEFAULT now(),
  "viewed_at" timestamp,
  "response_text" text,
  "proposed_cost" real,
  "proposed_timeline_weeks" real,
  "submitted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "rfp_vendor_scores" (
  "id" text PRIMARY KEY NOT NULL,
  "rfp_vendor_id" text NOT NULL REFERENCES "rfp_vendors"("id") ON DELETE CASCADE,
  "criterion_id" text NOT NULL REFERENCES "rfp_criteria"("id") ON DELETE CASCADE,
  "score" real NOT NULL DEFAULT 0,
  "rationale" text,
  "created_by_ai" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "rfp_vendor_score_uq" UNIQUE ("rfp_vendor_id", "criterion_id")
);

CREATE TABLE IF NOT EXISTS "rfp_recommendations" (
  "id" text PRIMARY KEY NOT NULL,
  "rfp_id" text NOT NULL UNIQUE REFERENCES "rfps"("id") ON DELETE CASCADE,
  "recommended_vendor_id" text REFERENCES "rfp_vendors"("id") ON DELETE SET NULL,
  "summary" text,
  "generated_at" timestamp NOT NULL DEFAULT now()
);
