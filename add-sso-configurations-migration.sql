-- Task #408: Enterprise SAML SSO.
-- Idempotent -- safe to run against a database that already has this table.

CREATE TABLE IF NOT EXISTS sso_configurations (
  id text PRIMARY KEY,
  organization_id text NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  email_domain text NOT NULL UNIQUE,
  idp_entity_id text NOT NULL,
  idp_sso_url text NOT NULL,
  idp_certificate text NOT NULL,
  default_role user_role NOT NULL DEFAULT 'VIEWER',
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
