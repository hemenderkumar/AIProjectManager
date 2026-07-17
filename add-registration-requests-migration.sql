-- Self-service registration: anyone can submit a request via the public /register page
-- (as an individual or a company owner) without it granting any access. An ADMIN must
-- approve it from the Admin page before a real login (`users` row) is created.
DO $$ BEGIN
  CREATE TYPE registration_type AS ENUM ('INDIVIDUAL', 'COMPANY_OWNER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE registration_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
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
