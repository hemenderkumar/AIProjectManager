-- Idea-category-aware Feasibility/Build Requirements + Charter unit economics
-- (Labor cost category, margin, Sourcing Recommendation, Staffing & Margin).
-- Idempotent -- safe to re-run against a database that already has some of this.

ALTER TYPE cost_item_category ADD VALUE IF NOT EXISTS 'LABOR';

DO $$ BEGIN
  CREATE TYPE "idea_category" AS ENUM ('SOFTWARE', 'HARDWARE_PHYSICAL', 'SERVICE', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "idea_category" "idea_category";
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "has_software_component" boolean NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "build_materials_list" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "build_infrastructure_needs" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "build_sourcing_notes" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "labor_cost_estimate" real;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "quoted_unit_price" real;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_margin_percent" real;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_monthly_volume" real;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sourcing_recommendation" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "staffing_margin_recommendation" text;
