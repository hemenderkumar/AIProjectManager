-- Migration: universal-sell features
-- Global search + project templates, custom fields + per-project workflow configuration,
-- automation rules engine, public API + webhooks + GitHub links, demand management.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "public"."custom_field_entity" AS ENUM ('PROJECT', 'TASK', 'RISK', 'DELIVERABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."custom_field_type" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTISELECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."automation_trigger" AS ENUM ('TASK_STATUS_CHANGED', 'TASK_ASSIGNED', 'TASK_OVERDUE', 'RISK_CREATED', 'DELIVERABLE_APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."demand_status" AS ENUM ('SUBMITTED', 'TRIAGED', 'SCORED', 'APPROVED', 'DEFERRED', 'REJECTED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."demand_type" AS ENUM ('STRATEGIC', 'RUN_THE_BUSINESS', 'COMPLIANCE', 'ENHANCEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing notification_type enum needs a new value for automation-rule NOTIFY actions.
DO $$ BEGIN
  ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'AUTOMATION';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Feature: global search + project templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "snapshot" jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Feature: custom fields + per-project workflow configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "custom_field_definitions" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "projects"("id") ON DELETE CASCADE,
  "entity" "custom_field_entity" NOT NULL,
  "field_key" text NOT NULL,
  "label" text NOT NULL,
  "type" "custom_field_type" NOT NULL DEFAULT 'TEXT',
  "options" text[],
  "required" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "custom_field_values" (
  "id" text PRIMARY KEY NOT NULL,
  "field_definition_id" text NOT NULL REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE,
  "entity_id" text NOT NULL,
  "value" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "custom_field_values_field_entity_idx"
  ON "custom_field_values" USING btree ("field_definition_id", "entity_id");

CREATE TABLE IF NOT EXISTS "workflow_stages" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text NOT NULL DEFAULT '#64748b',
  "is_terminal" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Feature: automation rules engine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" text REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "trigger" "automation_trigger" NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_run_at" timestamp,
  "run_count" integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Feature: public API + outbound webhooks + GitHub task links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "hashed_key" text NOT NULL UNIQUE,
  "key_prefix" text NOT NULL,
  "scopes" text[] NOT NULL DEFAULT '{}',
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp,
  "revoked_at" timestamp
);

CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "events" text[] NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_delivery_at" timestamp,
  "last_delivery_status" integer
);

CREATE TABLE IF NOT EXISTS "task_github_links" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "repo" text NOT NULL,
  "issue_or_pr_number" integer NOT NULL,
  "link_type" text NOT NULL DEFAULT 'ISSUE',
  "url" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Feature: demand management (front door to Ideation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "demand_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "requested_by_name" text NOT NULL,
  "requested_by_email" text NOT NULL,
  "division_id" text REFERENCES "divisions"("id") ON DELETE SET NULL,
  "type" "demand_type",
  "status" "demand_status" NOT NULL DEFAULT 'SUBMITTED',
  "triage_notes" text,
  "is_duplicate_of_id" text REFERENCES "demand_requests"("id") ON DELETE SET NULL,
  "business_value_score" integer,
  "urgency_score" integer,
  "effort_tshirt_size" text,
  "priority_score" real,
  "capacity_notes" text,
  "decision_reason" text,
  "decided_by" text,
  "decided_at" timestamp,
  "converted_project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "converted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
