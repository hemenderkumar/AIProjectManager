-- Run this once against your production database to create the table backing
-- Executa's "Report an issue" feature. After running it, the floating report
-- button will save successfully instead of showing "issue_reports table
-- doesn't exist yet".

CREATE TYPE "public"."issue_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

CREATE TABLE "issue_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text,
	"reporter_name" text,
	"reporter_email" text,
	"organization_id" text,
	"page_path" text NOT NULL,
	"description" text NOT NULL,
	"screenshot_data_url" text,
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
