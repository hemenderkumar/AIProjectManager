-- Bootstraps KeelConnect's first PLATFORM_ADMIN. Nothing in the app currently grants this
-- role automatically (unlike Keel Deliver's ADMIN/SUPER_USER, KeelConnect's PLATFORM_*
-- roles have no seed step), so until this runs once, nobody can open /keelconnect/admin,
-- approve a compliance record, or verify an organization -- every request gets a 403.
--
-- Run this once in your Postgres provider's SQL editor (Supabase, Neon, etc.), then log
-- in as the account below and set up MFA at /keelconnect/mfa -- PLATFORM_ADMIN is one of
-- the roles that requires it (see MFA_REQUIRED_ROLES in src/lib/keelconnect/access.ts),
-- so platform-gated actions will keep 403'ing until MFA is enabled too.

INSERT INTO sc_org_members (id, user_id, sc_organization_id, role)
SELECT
  'sc-platform-admin-' || u.id,
  u.id,
  NULL,
  'PLATFORM_ADMIN'
FROM users u
WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT DO NOTHING;

-- Sanity check -- should return one row with role = PLATFORM_ADMIN and
-- sc_organization_id = NULL.
SELECT m.id, m.role, m.sc_organization_id, u.email
FROM sc_org_members m
JOIN users u ON u.id = m.user_id
WHERE u.email = 'hemender.kumar@gmail.com';
