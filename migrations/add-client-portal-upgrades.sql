-- Client portal upgrades: (1) client approve / request-changes on deliverables, (2) deliverable
-- comments + file sharing, (3) white-label branding, (4) client invoices + Stripe Connect.
-- Idempotent -- safe to run more than once.
--
--   psql "$DATABASE_URL" -f migrations/add-client-portal-upgrades.sql
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres
-- versions. Run this file as-is with psql (autocommit), or in the Supabase SQL editor one
-- statement group at a time if your editor wraps scripts in a transaction.

-- 1) New deliverable status
ALTER TYPE deliverable_status ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

-- 2) Deliverable conversation + attachments (inline base64, same convention as signed docs)
DO $$ BEGIN
  CREATE TYPE deliverable_comment_kind AS ENUM ('COMMENT', 'DECISION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS deliverable_comments (
  id text PRIMARY KEY,
  deliverable_id text NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  kind deliverable_comment_kind NOT NULL DEFAULT 'COMMENT',
  author_user_id text,
  author_name text NOT NULL,
  author_side text NOT NULL DEFAULT 'TEAM',
  body text NOT NULL DEFAULT '',
  attachment_filename text,
  attachment_mime text,
  attachment_size integer,
  attachment_data text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deliverable_comments_deliverable_idx ON deliverable_comments (deliverable_id, created_at);

-- 3) White-label + Stripe Connect fields on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_display_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS login_slug text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS login_tagline text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hide_powered_by boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_from_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_reply_to text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_connect_ready boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_login_slug_unique ON organizations (login_slug) WHERE login_slug IS NOT NULL;

-- 4) Client receivables (separate from `invoices`, which are vendor bills / payables)
DO $$ BEGIN
  CREATE TYPE client_invoice_status AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS client_invoices (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number text NOT NULL,
  description text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  due_date timestamp,
  status client_invoice_status NOT NULL DEFAULT 'DRAFT',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamp,
  payment_method text,
  receipt_url text,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_invoices_project_idx ON client_invoices (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_invoices_org_number_unique ON client_invoices (organization_id, number);

-- If you enabled RLS on all public tables (see earlier hardening), keep the new tables consistent:
ALTER TABLE deliverable_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;
