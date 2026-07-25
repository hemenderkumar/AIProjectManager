-- Consolidated re-apply of every idempotent Executa migration (v3 -- folds in
-- add-org-enable-disable.sql now that the enable/disable admin feature is built and
-- committed; also carries the earlier v2 bare-ADD-COLUMN fix and the duplicate_table
-- exception fix for named UNIQUE constraints).
-- Safe to run in full against production at any time: every statement below now uses
-- IF NOT EXISTS / ON CONFLICT / an EXCEPTION-wrapped CREATE TYPE, so anything already
-- applied is a silent no-op and anything missing gets added.
--
-- Deliberately EXCLUDED (not idempotent, will error if already applied -- both are
-- near-certainly already applied given the app works):
--   add-ideation-gates.sql       (bare CREATE TYPE / ADD COLUMN / CREATE TABLE)
--   add-projectrequesta-schema.sql   (bare CREATE TYPE x15 -- the ProjectRequesta base schema)
-- Also excluded: the one-time data scripts (seed-test-companies-vendors.sql,
-- grant-projectrequesta-platform-admin.sql).

-- ============================================================
-- Source: add-activity-tracking-migration.sql
-- ============================================================
-- Login tracking columns on users, plus a lightweight activity_events table for logins
-- and public-link visits (login page, marketing homepage, RFP vendor links).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  user_name text,
  path text,
  detail text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-cost-invoice-time-migration.sql
-- ============================================================
-- Adds contingency %, ongoing support estimate, material/support cost items,
-- vendor invoice tracking, and task time-log entries. Run once in Supabase's SQL Editor.

-- 1. Contingency + ongoing support on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contingency_percent real DEFAULT 10;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ongoing_support_monthly_cost real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ongoing_support_plan text;

-- 2. Cost items (material costs like licenses/servers, and ongoing support cost items)
DO $$ BEGIN
  CREATE TYPE cost_item_category AS ENUM ('MATERIAL', 'ONGOING_SUPPORT');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS cost_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category cost_item_category NOT NULL DEFAULT 'MATERIAL',
  name text NOT NULL,
  amount real NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  cadence text,
  notes text,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 3. Vendor / contractor invoice tracking
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'DISPUTED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor text NOT NULL,
  invoice_number text,
  amount real NOT NULL DEFAULT 0,
  invoice_date timestamp,
  due_date timestamp,
  status invoice_status NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 4. Task effort/time-log entries
CREATE TABLE IF NOT EXISTS time_entries (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_id text REFERENCES resources(id),
  hours real NOT NULL DEFAULT 0,
  entry_date timestamp NOT NULL DEFAULT now(),
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-deliverable-design-fields.sql
-- ============================================================
-- Run this once against your production database. Adds four structured, DESIGN-deliverable-
-- only fields (broken out of the single "content" blob so AI can fill each in separately and
-- the user can edit each independently): component list, architecture highlights, pros, cons.
-- Nullable and unused for every other deliverable type.

ALTER TABLE "deliverables" ADD COLUMN IF NOT EXISTS "component_list" text;
ALTER TABLE "deliverables" ADD COLUMN IF NOT EXISTS "architecture_highlights" text;
ALTER TABLE "deliverables" ADD COLUMN IF NOT EXISTS "pros" text;
ALTER TABLE "deliverables" ADD COLUMN IF NOT EXISTS "cons" text;

-- ============================================================
-- Source: add-deliverable-diagram-migration.sql
-- ============================================================
-- Detailed Design deliverables gain a pictorial architecture/component diagram (Mermaid syntax,
-- same convention as projects.architecture_diagram) in addition to the narrative content.
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS diagram text;

-- ============================================================
-- Source: add-delivery-pricing-migration.sql
-- ============================================================
-- Delivery model & pricing: configurable rate cards (role + sourcing type), a resource's
-- sourcing type, per-project pricing model/fixed-bid fields, and the delivery role-mix
-- breakdown table. Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE sourcing_type AS ENUM ('ONSITE', 'OFFSHORE', 'CONTRACTOR');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_model AS ENUM ('FIXED_BID', 'TIME_AND_MATERIALS', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE resources ADD COLUMN IF NOT EXISTS sourcing_type sourcing_type;

CREATE TABLE IF NOT EXISTS rate_cards (
  id text PRIMARY KEY,
  role text NOT NULL,
  sourcing_type sourcing_type NOT NULL DEFAULT 'ONSITE',
  hourly_rate real NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE rate_cards ADD CONSTRAINT rate_card_role_sourcing_uq UNIQUE (role, sourcing_type);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pricing_model pricing_model;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fixed_bid_price real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_rationale text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_recommended_at timestamp;

CREATE TABLE IF NOT EXISTS delivery_role_mix (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL,
  hours real NOT NULL DEFAULT 0,
  onsite_percent real NOT NULL DEFAULT 100,
  offshore_percent real NOT NULL DEFAULT 0,
  contractor_percent real NOT NULL DEFAULT 0,
  rationale text,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-divisions-stakeholders-rfp-migration.sql
-- ============================================================
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
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "vendor_response_status" AS ENUM ('INVITED', 'VIEWED', 'SUBMITTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
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

-- ============================================================
-- Source: add-docx-approval-signed-copy-migration.sql
-- ============================================================
-- Adds: an APPROVED status for SOWs (an internal review step distinct from the vendor's own
-- signature), and — on both sows and deliverables — an internal approval stamp plus the ability
-- to attach the executed/signed copy as a PDF (stored inline as base64 text, so no external
-- object storage needs to be provisioned).

ALTER TYPE sow_status ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE sows ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_filename text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_data text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_uploaded_at timestamp;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_uploaded_by text;

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_filename text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_data text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_uploaded_at timestamp;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_uploaded_by text;

-- ============================================================
-- Source: add-execution-methodology-migration.sql
-- ============================================================
-- Execution methodology (Waterfall/Scrum/Hybrid), SDLC phase tracking, sprints, and the
-- technical recommendation + Enterprise Architect review + expanded charter fields. Run
-- once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE execution_methodology AS ENUM ('WATERFALL', 'SCRUM', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE technical_review_status AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sprint_status AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS execution_methodology execution_methodology NOT NULL DEFAULT 'WATERFALL';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS recommended_technology text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_recommendation_rationale text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_review_status technical_review_status;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_reviewed_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_reviewed_at timestamp;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS technical_review_notes text;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS high_level_requirements text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_diagram text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS internal_support_needs text;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS story_points real;

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date timestamp,
  end_date timestamp,
  status sprint_status NOT NULL DEFAULT 'PLANNED',
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id) ON DELETE SET NULL;

-- ============================================================
-- Source: add-executive-summary-fields.sql
-- ============================================================
-- Adds the executive_summary column used by the new "Executive Summary" section on
-- Charter, SOW, and Deliverables. Run this once against production.
--
-- (projects.executive_summary was already added and shipped with the Charter changes in a
-- prior commit -- included here again with IF NOT EXISTS so this file is safe to run
-- standalone even if that one's already applied.)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS executive_summary text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS executive_summary text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS executive_summary text;

-- ============================================================
-- Source: add-ideation-v2-migration.sql
-- ============================================================
-- Ideation redesign: idea origin type, internal ideation status, a running brainstorm
-- log, and a solution-options comparison table. Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE idea_type AS ENUM ('OPPORTUNITY', 'PROBLEM');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ideation_status AS ENUM ('EXPLORING', 'COMPARING_OPTIONS', 'READY_FOR_CHARTER');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS idea_type idea_type;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ideation_status ideation_status NOT NULL DEFAULT 'EXPLORING';

DO $$ BEGIN
  CREATE TYPE brainstorm_entry_source AS ENUM ('AI', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS brainstorm_entries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source brainstorm_entry_source NOT NULL DEFAULT 'MANUAL',
  author text,
  content text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solution_options (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  pros text,
  cons text,
  feasibility_notes text,
  is_selected boolean NOT NULL DEFAULT false,
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-ideation-workflow-migration.sql
-- ============================================================
-- Adds fields for the expanded Ideation workflow: alignment decision, AI feasibility
-- assessment, and the Ideation -> Execution approval gate. Run once in Supabase's SQL Editor.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS ideation_alignment text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS feasibility_score integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS feasibility_notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_approved_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_approved_at timestamp;

-- ============================================================
-- Source: add-implementation-cost-category.sql
-- ============================================================
-- Adds an "IMPLEMENTATION" value to the cost_item_category enum so the Charter's
-- Implementation cost line (previously a single number) can be broken down into itemized
-- cost_items rows, same as Material and Ongoing support already are.
ALTER TYPE cost_item_category ADD VALUE IF NOT EXISTS 'IMPLEMENTATION';

-- ============================================================
-- Source: add-incidents-migration.sql
-- ============================================================
-- Adds the Ongoing Support incident/issue queue (portfolio-wide, optionally linked to a
-- project). Run once in Supabase's SQL Editor.

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity priority NOT NULL DEFAULT 'MEDIUM',
  status incident_status NOT NULL DEFAULT 'OPEN',
  reported_by text,
  assignee text,
  reported_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  resolution_notes text,
  ai_recommendation text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-projectrequesta-change-requests.sql
-- ============================================================
-- Lets a live (ACTIVE) ProjectRequesta Agreement's terms be revised through mutual approval
-- instead of a unilateral rewrite: one party proposes a change, a DIFFERENT party (or
-- Platform Admin) has to accept it before it's applied. Pre-ACTIVE agreements (DRAFT/SENT/
-- SIGNED) are unaffected -- edits there still apply directly, since nothing binding has been
-- attested yet.

DO $$ BEGIN
  CREATE TYPE sc_change_request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sc_agreement_change_requests (
  id text PRIMARY KEY,
  sc_agreement_id text NOT NULL REFERENCES sc_agreements(id) ON DELETE CASCADE,
  proposed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  proposed_by_org_id text REFERENCES sc_organizations(id) ON DELETE SET NULL,
  changes text NOT NULL,
  note text,
  status sc_change_request_status NOT NULL DEFAULT 'PENDING',
  created_at timestamp NOT NULL DEFAULT now(),
  decided_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp
);

CREATE INDEX IF NOT EXISTS sc_agreement_change_requests_agreement_idx
  ON sc_agreement_change_requests (sc_agreement_id);

-- ============================================================
-- Source: add-projectrequesta-resource-requests.sql
-- ============================================================
-- Adds a lighter-weight "Resource Request" posting type to ProjectRequesta (e.g. "need 2 senior
-- React developers for 3 months") alongside the existing full Project posting. Deliberately
-- reuses sc_projects/sc_bids/negotiations/agreements/milestones/payments/reviews rather than
-- a parallel table set -- a Vendor "bids" a proposed rate on a Resource Request exactly the
-- way they'd bid a price on a Project. request_type defaults to PROJECT so every existing
-- row is unaffected.

DO $$ BEGIN
  CREATE TYPE sc_request_type AS ENUM ('PROJECT', 'RESOURCE_REQUEST');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sc_rate_type AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'FIXED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE sc_projects
  ADD COLUMN IF NOT EXISTS request_type sc_request_type NOT NULL DEFAULT 'PROJECT',
  ADD COLUMN IF NOT EXISTS skills_required text[],
  ADD COLUMN IF NOT EXISTS duration_weeks integer,
  ADD COLUMN IF NOT EXISTS rate_type sc_rate_type;

-- ============================================================
-- Source: add-projectrequesta-stripe-connect.sql
-- ============================================================
-- Real payments via Stripe Connect (#259). "Separate charges and transfers" escrow model:
-- a Client's Checkout Session captures funds onto the Platform's own Stripe balance
-- (PENDING -> HELD), and releasing the payment issues a real Transfer to the Vendor's
-- connected account (HELD -> RELEASED). All columns nullable -- every pre-existing row, and
-- every org/payment that never touches Stripe, is unaffected.

ALTER TABLE sc_organizations
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE sc_payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

-- ============================================================
-- Source: add-projectrequesta-vendor-profile.sql
-- ============================================================
-- Vendor discovery (#255) + public vendor profile (#256): adds searchable/public-facing
-- profile fields to sc_organizations. All nullable -- existing rows (and Client orgs, which
-- never populate these) are unaffected. public_slug is unique so it can back a logged-out
-- SEO-indexable profile URL (e.g. /marketplace/vendors/<slug>).

ALTER TABLE sc_organizations
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS categories text[],
  ADD COLUMN IF NOT EXISTS skills text[],
  ADD COLUMN IF NOT EXISTS price_band_min real,
  ADD COLUMN IF NOT EXISTS price_band_max real,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS public_slug text;

DO $$ BEGIN
  ALTER TABLE sc_organizations ADD CONSTRAINT sc_organizations_public_slug_unique UNIQUE (public_slug);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

-- ============================================================
-- Source: add-material-cost-estimate-field.sql
-- ============================================================
-- Adds the material_cost_estimate column used by the Charter's now-editable/AI-draftable
-- Cost Summary (Material cost is no longer purely a read-only rollup of itemized cost
-- items -- it's its own directly editable figure now, same idea as budgetPlanned).
--
-- contingency_percent already exists with a DEFAULT 10 at the schema level (added in an
-- earlier migration) -- nothing further needed there; existing rows that predate that
-- column may still be NULL, which the app already treats as 10% via `?? 10` wherever it's
-- read, so no backfill is required.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS material_cost_estimate real;

-- ============================================================
-- Source: add-multi-tenancy-migration.sql
-- ============================================================
-- Adds multi-tenant data isolation: client organizations, organization scoping on users
-- and projects, the new SUPER_USER role, and a generic audit log table. Run once in
-- Supabase's SQL Editor.

-- New role: ADMIN (sees everything) / SUPER_USER (sees everything for their own
-- organization) / PM, CONTRIBUTOR, VIEWER (scoped to individual projects they're a
-- member of). Existing ADMIN/PM/CONTRIBUTOR/VIEWER rows are unaffected.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_USER';

-- A client company (tenant). Internal staff have organization_id = null on their user
-- row; every client-side user belongs to exactly one. Every project optionally belongs
-- to one organization (the client it's for) — null means internal-only.
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE SET NULL;

-- Generic audit trail for sensitive actions (charter approvals, technical review
-- decisions, rate changes, deletions, etc.) — one table, free-text action/detail, so new
-- audited actions don't need a schema change later.
CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  detail text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-org-deletion-request-migration.sql
-- ============================================================
-- Data export & deletion self-service (Request -> Admin confirms flow).
-- Run this against your production database after the multi-tenancy migration.
-- Safe to re-run: guards with IF NOT EXISTS / column-existence checks are not needed here
-- since these are new nullable columns, but they're written idempotently anyway.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deletion_requested_by" text;

-- ============================================================
-- Source: add-password-reset-migration.sql
-- ============================================================
-- Self-service and admin-initiated password resets: a one-time, expiring tokenized link
-- (same pattern as status_requests), instead of an admin having to invent/communicate a
-- password directly.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-rate-card-org-scoping-migration.sql
-- ============================================================
-- Rate Cards become per-company: organization_id = null stays Executa's own internal default
-- list (used for internal/Executa-run projects, and as a fallback for any client company that
-- hasn't set its own rates yet); non-null = that specific client company's own rates.
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE CASCADE;

-- Replace the old (role, sourcing_type) uniqueness with (organization_id, role, sourcing_type)
-- so different companies (and the null/global list) can each have their own "Backend
-- Engineer / Onsite" row without colliding.
ALTER TABLE rate_cards DROP CONSTRAINT IF EXISTS rate_card_role_sourcing_uq;
DO $$ BEGIN
  ALTER TABLE rate_cards ADD CONSTRAINT rate_card_org_role_sourcing_uq UNIQUE (organization_id, role, sourcing_type);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

-- ============================================================
-- Source: add-registration-requests-migration.sql
-- ============================================================
-- Self-service registration: anyone can submit a request via the public /register page
-- (as an individual or a company owner) without it granting any access. An ADMIN must
-- approve it from the Admin page before a real login (`users` row) is created.
DO $$ BEGIN
  CREATE TYPE registration_type AS ENUM ('INDIVIDUAL', 'COMPANY_OWNER');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE registration_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS registration_requests (
  id text PRIMARY KEY,
  type registration_type NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  company_name text,
  status registration_status NOT NULL DEFAULT 'PENDING',
  requested_at timestamp NOT NULL DEFAULT now(),
  reviewed_at timestamp,
  reviewed_by text,
  resulting_user_id text REFERENCES users(id) ON DELETE SET NULL,
  resulting_organization_id text REFERENCES organizations(id) ON DELETE SET NULL
);

-- ============================================================
-- Source: add-slack-calendar-integrations.sql
-- ============================================================
-- Slack notifications + calendar (.ics) feed integrations (#263).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS slack_webhook_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ics_token text;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_ics_token_unique UNIQUE (ics_token);
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

-- ============================================================
-- Source: add-sow-deliverables-migration.sql
-- ============================================================
-- Statement of Work (SOW) module: the formal contract between the company and a vendor for
-- a project (scope, deliverables summary, timeline, funding, risks, issues, status, and the
-- full AI-drafted/edited document text). Optionally linked to a vendor already evaluated
-- through the RFP module.
DO $$ BEGIN
  CREATE TYPE sow_status AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'COMPLETED', 'TERMINATED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS sows (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfp_vendor_id text REFERENCES rfp_vendors(id) ON DELETE SET NULL,
  title text NOT NULL,
  vendor_name text NOT NULL,
  vendor_contact_name text,
  vendor_contact_email text,
  status sow_status NOT NULL DEFAULT 'DRAFT',
  scope text,
  deliverables_summary text,
  timeline text,
  funding_amount real,
  funding_terms text,
  risks text,
  issues text,
  content text,
  created_by_ai boolean NOT NULL DEFAULT false,
  signed_by text,
  signed_at timestamp,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Lets an SOW's contractual milestones show up in the project's existing Milestones tab
-- (one shared list) instead of a separate SOW-only milestones concept.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS sow_id text REFERENCES sows(id) ON DELETE CASCADE;

-- Deliverables module: AI-generated working documents attached to a project (requirements/
-- NFR, design, functional test script, UAT script, release documentation, or other).
DO $$ BEGIN
  CREATE TYPE deliverable_type AS ENUM ('REQUIREMENTS_NFR', 'DESIGN', 'FUNCTIONAL_TEST_SCRIPT', 'UAT_SCRIPT', 'RELEASE_DOCUMENTATION', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deliverable_status AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'FINAL');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS deliverables (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type deliverable_type NOT NULL,
  title text NOT NULL,
  content text,
  status deliverable_status NOT NULL DEFAULT 'DRAFT',
  created_by_ai boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Executable test cases for a FUNCTIONAL_TEST_SCRIPT or UAT_SCRIPT deliverable: AI-generated
-- initially, then actually run by the team (actual_result/status/executed_by/executed_at
-- filled in as each one is executed).
DO $$ BEGIN
  CREATE TYPE test_case_status AS ENUM ('NOT_RUN', 'PASS', 'FAIL', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS deliverable_test_cases (
  id text PRIMARY KEY,
  deliverable_id text NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  scenario text NOT NULL,
  steps text,
  expected_result text,
  actual_result text,
  status test_case_status NOT NULL DEFAULT 'NOT_RUN',
  executed_by text,
  executed_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ============================================================
-- Source: add-state-province-migration.sql
-- ============================================================
-- Adds the new "State/Province" field paired with the existing project Country tag.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_province text;

-- ============================================================
-- Source: add-task-comments-notifications.sql
-- ============================================================
-- Task comments + @mentions + notifications/digest (#262).

CREATE TABLE IF NOT EXISTS task_comments (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id text REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (task_id);

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('MENTION', 'COMMENT', 'DIGEST');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at);

-- ============================================================
-- Source: add-task-dependencies.sql
-- ============================================================
-- Task dependencies + Gantt/timeline view (#264).

CREATE TABLE IF NOT EXISTS task_dependencies (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_dependency_uq ON task_dependencies (task_id, depends_on_task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_idx ON task_dependencies (depends_on_task_id);

-- ============================================================
-- Source: add-task-execution-source-migration.sql
-- ============================================================
-- Who/what executes a task: AI-doable, internal team, or external vendor. Suggested by AI
-- at task creation (bulk project planning + single-task Draft with AI), always editable.
DO $$ BEGIN
  CREATE TYPE task_execution_source AS ENUM ('AI', 'INTERNAL', 'VENDOR');
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN duplicate_table THEN null;
END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_source task_execution_source;

-- ============================================================
-- Source: add-task-projectrequesta-link.sql
-- ============================================================
-- Links a Executa task to the ProjectRequesta marketplace project it was posted as, once a
-- VENDOR-classified task is pushed over via /api/projects/[id]/tasks/[taskId]/post-to-projectrequesta.
-- Nullable -- most tasks never get posted. Run once in your Postgres provider's SQL editor.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sc_project_id text REFERENCES sc_projects(id) ON DELETE SET NULL;

-- ============================================================
-- Source: add-user-disabled-columns.sql
-- ============================================================
-- Run this once against your production database for the "instant individual access, but
-- rejectable later" registration feature. Only two new nullable columns on users; safe to
-- run any time.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_reason" text;

-- ============================================================
-- Source: add-user-theme-column.sql
-- ============================================================
-- Run this once against your production database for the "theme follows your account,
-- not the browser" feature. One new column on users, defaulted to 'indigo' so every
-- existing account keeps the theme it currently sees. Safe to run any time.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" text NOT NULL DEFAULT 'indigo';

-- ============================================================
-- Source: add-user-verified-column.sql
-- ============================================================
-- Run this once against your production database for the "no downloads until admin
-- approval" feature. One new nullable column on users, defaulted to now() so every
-- existing account (and every other account-creation path) is treated as already
-- verified. Safe to run any time.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified_at" timestamp DEFAULT now();

-- ============================================================
-- Source: add-org-enable-disable.sql
-- ============================================================
-- Soft enable/disable for Deliver companies + ProjectRequesta organizations -- backs the
-- Enable/Disable toggles and AI-edit chat in both admin consoles. Safe to run any time.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE sc_organizations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

