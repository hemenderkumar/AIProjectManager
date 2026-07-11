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
