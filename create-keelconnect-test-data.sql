-- Seeds a handful of test Client + Vendor organizations (already VERIFIED, so no compliance
-- friction) and gives your account (hemender.kumar@gmail.com) an admin role in every one of
-- them. That's deliberate: KeelConnect's "Posting as..." / "Bidding as..." dropdowns are
-- scoped to whichever orgs you belong to, so with this single login you can post a project
-- as one Client org, then switch to a Vendor org to submit/counter a bid against it, then
-- switch back to the Client org to accept it -- exercising the whole flow without needing
-- separate test accounts. Run once in your Postgres provider's SQL editor.

-- 2 Client orgs
INSERT INTO sc_organizations (id, name, org_type, company_profile, primary_country, verification_status, verified_at)
VALUES
  ('sc-org-client-acme', 'Acme Retail Co', 'CLIENT', 'Mid-size retail chain modernizing its e-commerce stack.', 'United States', 'VERIFIED', now()),
  ('sc-org-client-northwind', 'Northwind Logistics', 'CLIENT', 'Freight & logistics operator outsourcing IT projects.', 'Canada', 'VERIFIED', now())
ON CONFLICT (id) DO NOTHING;

-- 2 Vendor orgs
INSERT INTO sc_organizations (id, name, org_type, company_profile, primary_country, verification_status, verified_at)
VALUES
  ('sc-org-vendor-brightpath', 'BrightPath Dev Studio', 'VENDOR', 'Full-stack web & mobile development shop, 30 engineers.', 'India', 'VERIFIED', now()),
  ('sc-org-vendor-vertex', 'Vertex Security Partners', 'VENDOR', 'Security audits, penetration testing, compliance consulting.', 'Germany', 'VERIFIED', now())
ON CONFLICT (id) DO NOTHING;

-- Give your account an admin role in all four -- lets you act as either Client and either
-- Vendor from the one login.
INSERT INTO sc_org_members (id, user_id, sc_organization_id, role)
SELECT 'sc-member-' || u.id || '-acme', u.id, 'sc-org-client-acme', 'CLIENT_ORG_ADMIN'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO sc_org_members (id, user_id, sc_organization_id, role)
SELECT 'sc-member-' || u.id || '-northwind', u.id, 'sc-org-client-northwind', 'CLIENT_ORG_ADMIN'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO sc_org_members (id, user_id, sc_organization_id, role)
SELECT 'sc-member-' || u.id || '-brightpath', u.id, 'sc-org-vendor-brightpath', 'VENDOR_ORG_ADMIN'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO sc_org_members (id, user_id, sc_organization_id, role)
SELECT 'sc-member-' || u.id || '-vertex', u.id, 'sc-org-vendor-vertex', 'VENDOR_ORG_ADMIN'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT DO NOTHING;

-- One project already OPEN and ready to bid on right now, one left as DRAFT so you can also
-- test the "post to marketplace" step yourself.
INSERT INTO sc_projects (id, client_org_id, posted_by_user_id, title, description, category, target_budget, currency, engagement_model, location_requirement, status)
SELECT
  'sc-proj-acme-ecommerce', 'sc-org-client-acme', u.id,
  'Rebuild checkout flow on modern stack',
  'Our checkout is on a legacy monolith causing cart-abandonment issues. Need a team to rebuild it as a decoupled service with a modern frontend, integrated with our existing payment gateway.',
  'Web Development', 45000, 'USD', 'MARKETPLACE', 'GLOBAL', 'OPEN'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT (id) DO NOTHING;

INSERT INTO sc_projects (id, client_org_id, posted_by_user_id, title, description, category, target_budget, currency, engagement_model, location_requirement, status)
SELECT
  'sc-proj-northwind-audit', 'sc-org-client-northwind', u.id,
  'Annual security audit + penetration test',
  'Need a full external + internal penetration test of our logistics tracking platform ahead of our SOC 2 renewal.',
  'Security Audit', 18000, 'USD', 'MARKETPLACE', 'GLOBAL', 'DRAFT'
FROM users u WHERE u.email = 'hemender.kumar@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Sanity check
SELECT o.name, o.org_type, o.verification_status FROM sc_organizations o WHERE o.id LIKE 'sc-org-%';
SELECT p.title, p.status, o.name AS client FROM sc_projects p JOIN sc_organizations o ON o.id = p.client_org_id WHERE p.id LIKE 'sc-proj-%';
