-- ProjectRequesta: B2B marketplace for global IT project outsourcing (separate track
-- alongside Executa). Adds a full new set of tables (sc_*), enums, and a few
-- columns on existing tables (users, audit_log). Run this once against production
-- before deploying the commit that introduces these Drizzle schema changes.

-- Enums
CREATE TYPE sc_org_type AS ENUM ('CLIENT', 'VENDOR');
CREATE TYPE sc_verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE sc_role AS ENUM (
  'PLATFORM_ADMIN', 'PLATFORM_COMPLIANCE_OFFICER', 'PLATFORM_SUPPORT',
  'CLIENT_ORG_ADMIN', 'CLIENT_REQUESTER', 'CLIENT_FINANCE_APPROVER',
  'VENDOR_ORG_ADMIN', 'VENDOR_CONTRIBUTOR'
);
CREATE TYPE sc_project_status AS ENUM ('DRAFT', 'OPEN', 'NEGOTIATING', 'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE sc_engagement_model AS ENUM ('MEDIATOR', 'MARKETPLACE');
CREATE TYPE sc_location_requirement AS ENUM ('GLOBAL', 'RESTRICTED');
CREATE TYPE sc_bid_status AS ENUM ('SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED');
CREATE TYPE sc_agreement_type AS ENUM ('CLIENT_PLATFORM', 'PLATFORM_VENDOR', 'CLIENT_VENDOR');
CREATE TYPE sc_agreement_status AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE sc_agreement_party_role AS ENUM ('CLIENT', 'VENDOR', 'PLATFORM');
CREATE TYPE sc_milestone_status AS ENUM ('PENDING', 'APPROVED', 'PAID');
CREATE TYPE sc_payment_direction AS ENUM ('CLIENT_TO_PLATFORM', 'PLATFORM_TO_VENDOR', 'CLIENT_TO_VENDOR', 'PLATFORM_COMMISSION');
CREATE TYPE sc_payment_status AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED');
CREATE TYPE sc_compliance_type AS ENUM ('KYC', 'KYB', 'SANCTIONS_SCREENING', 'TAX_FORM');
CREATE TYPE sc_dispute_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- Existing-table additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sc_organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  org_type sc_org_type NOT NULL,
  company_profile text,
  tax_id text,
  primary_country text,
  verification_status sc_verification_status NOT NULL DEFAULT 'PENDING',
  verified_at timestamp,
  sso_enabled boolean NOT NULL DEFAULT false,
  saml_entity_id text,
  saml_idp_metadata_url text,
  saml_idp_cert text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- audit_log additions reference sc_organizations, so this table must exist first.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS sc_organization_id text REFERENCES sc_organizations(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before_value text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after_value text;

CREATE TABLE IF NOT EXISTS sc_org_members (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sc_organization_id text REFERENCES sc_organizations(id) ON DELETE CASCADE,
  role sc_role NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sc_org_member_uq ON sc_org_members (user_id, sc_organization_id, role);

CREATE TABLE IF NOT EXISTS sc_compliance_records (
  id text PRIMARY KEY,
  sc_organization_id text NOT NULL REFERENCES sc_organizations(id) ON DELETE CASCADE,
  type sc_compliance_type NOT NULL,
  status sc_verification_status NOT NULL DEFAULT 'PENDING',
  verified_at timestamp,
  expires_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_projects (
  id text PRIMARY KEY,
  client_org_id text NOT NULL REFERENCES sc_organizations(id) ON DELETE CASCADE,
  posted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text,
  target_budget real,
  currency text NOT NULL DEFAULT 'USD',
  deadline timestamp,
  engagement_model sc_engagement_model NOT NULL DEFAULT 'MARKETPLACE',
  location_requirement sc_location_requirement NOT NULL DEFAULT 'GLOBAL',
  restricted_countries text[],
  status sc_project_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_bids (
  id text PRIMARY KEY,
  sc_project_id text NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  vendor_org_id text NOT NULL REFERENCES sc_organizations(id) ON DELETE CASCADE,
  submitted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  proposed_price real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  timeline text,
  status sc_bid_status NOT NULL DEFAULT 'SUBMITTED',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_negotiation_entries (
  id text PRIMARY KEY,
  sc_bid_id text NOT NULL REFERENCES sc_bids(id) ON DELETE CASCADE,
  price real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  terms text,
  proposed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  proposed_by_org_type sc_org_type NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_agreements (
  id text PRIMARY KEY,
  sc_project_id text NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  sc_bid_id text REFERENCES sc_bids(id) ON DELETE SET NULL,
  type sc_agreement_type NOT NULL,
  governing_law text,
  governing_language text NOT NULL DEFAULT 'en',
  status sc_agreement_status NOT NULL DEFAULT 'DRAFT',
  signed_document_url text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_agreement_parties (
  id text PRIMARY KEY,
  sc_agreement_id text NOT NULL REFERENCES sc_agreements(id) ON DELETE CASCADE,
  party_role sc_agreement_party_role NOT NULL,
  sc_organization_id text REFERENCES sc_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sc_milestones (
  id text PRIMARY KEY,
  sc_agreement_id text NOT NULL REFERENCES sc_agreements(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  due_date timestamp,
  status sc_milestone_status NOT NULL DEFAULT 'PENDING',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_payments (
  id text PRIMARY KEY,
  sc_milestone_id text NOT NULL REFERENCES sc_milestones(id) ON DELETE CASCADE,
  amount real NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  fx_rate_applied real,
  direction sc_payment_direction NOT NULL,
  status sc_payment_status NOT NULL DEFAULT 'PENDING',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sc_disputes (
  id text PRIMARY KEY,
  sc_project_id text REFERENCES sc_projects(id) ON DELETE CASCADE,
  sc_agreement_id text REFERENCES sc_agreements(id) ON DELETE CASCADE,
  raised_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  description text NOT NULL,
  status sc_dispute_status NOT NULL DEFAULT 'OPEN',
  resolution_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);

CREATE TABLE IF NOT EXISTS sc_reviews (
  id text PRIMARY KEY,
  sc_project_id text NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  from_org_type sc_org_type NOT NULL,
  author_user_id text REFERENCES users(id) ON DELETE SET NULL,
  rating integer NOT NULL,
  comments text,
  created_at timestamp NOT NULL DEFAULT now()
);
