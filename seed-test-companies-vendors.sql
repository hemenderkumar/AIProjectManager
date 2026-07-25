-- Test data: 10 Deliver companies + 10 ProjectRequesta vendors with varying ratings.
-- Safe to run against a dev/test database; every row uses a 'seed-' id prefix so it's
-- trivially identifiable and reversible (see the DELETE block at the bottom).
--
-- Note: Deliver companies (organizations) have no rating column in this app -- just a name.
-- ProjectRequesta vendor ratings are computed live from reviews on completed projects, so each
-- vendor below gets a fake completed project + accepted bid + client review behind it to
-- actually produce a rating the UI will show.

-- ---------------------------------------------------------------------------
-- 1. Ten Deliver companies (organizations)
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, created_at) VALUES
  ('seed-org-01', 'Aurora Health Systems', now()),
  ('seed-org-02', 'Meridian Financial Group', now()),
  ('seed-org-03', 'Northwind Logistics', now()),
  ('seed-org-04', 'Cobalt Manufacturing Co.', now()),
  ('seed-org-05', 'Redwood Retail Holdings', now()),
  ('seed-org-06', 'Summit Energy Partners', now()),
  ('seed-org-07', 'Lighthouse Insurance Group', now()),
  ('seed-org-08', 'Pinnacle Public Schools', now()),
  ('seed-org-09', 'Cascade Biotech', now()),
  ('seed-org-10', 'Union Municipal Services', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. One seed ProjectRequesta client org, used to post the test projects vendors bid on
-- ---------------------------------------------------------------------------
INSERT INTO sc_organizations (id, name, org_type, verification_status, created_at) VALUES
  ('seed-client-01', 'Test Client Co.', 'CLIENT', 'VERIFIED', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Ten ProjectRequesta vendor orgs -- varied categories, price bands, verification status
-- ---------------------------------------------------------------------------
INSERT INTO sc_organizations
  (id, name, org_type, verification_status, headline, categories, skills, price_band_min, price_band_max, public_slug, created_at)
VALUES
  ('seed-vendor-01', 'Alpha Software Studio', 'VENDOR', 'VERIFIED',
    'Full-stack product teams for regulated industries', ARRAY['Software Development','DevOps'], ARRAY['React','Node.js','AWS'], 8000, 60000, 'alpha-software-studio', now()),
  ('seed-vendor-02', 'Bright Path Consulting', 'VENDOR', 'VERIFIED',
    'Management consulting for healthcare operations', ARRAY['Consulting','Healthcare'], ARRAY['Process Improvement','Change Management'], 15000, 90000, 'bright-path-consulting', now()),
  ('seed-vendor-03', 'Cirrus Data Labs', 'VENDOR', 'VERIFIED',
    'Data engineering and analytics on demand', ARRAY['Data Engineering','Analytics'], ARRAY['Python','SQL','dbt'], 6000, 45000, 'cirrus-data-labs', now()),
  ('seed-vendor-04', 'Driftwood Creative', 'VENDOR', 'PENDING',
    'Brand and marketing collateral for mid-market teams', ARRAY['Design','Marketing'], ARRAY['Branding','Figma'], 3000, 20000, 'driftwood-creative', now()),
  ('seed-vendor-05', 'Ember Security Group', 'VENDOR', 'VERIFIED',
    'Penetration testing and compliance audits', ARRAY['Security','Compliance'], ARRAY['SOC 2','Pen Testing'], 10000, 75000, 'ember-security-group', now()),
  ('seed-vendor-06', 'Fieldstone Legal Tech', 'VENDOR', 'PENDING',
    'Contract automation tooling for legal teams', ARRAY['Legal Tech','Software Development'], ARRAY['Contract Automation','.NET'], 5000, 40000, 'fieldstone-legal-tech', now()),
  ('seed-vendor-07', 'Granite Infrastructure Partners', 'VENDOR', 'VERIFIED',
    'Cloud migration and infrastructure hardening', ARRAY['DevOps','Cloud'], ARRAY['Terraform','Kubernetes','Azure'], 12000, 100000, 'granite-infrastructure-partners', now()),
  ('seed-vendor-08', 'Harbor Staffing Solutions', 'VENDOR', 'REJECTED',
    'Contract staffing for back-office operations', ARRAY['Staffing','Operations'], ARRAY['BPO','Recruiting'], 2000, 15000, 'harbor-staffing-solutions', now()),
  ('seed-vendor-09', 'Ironclad QA Collective', 'VENDOR', 'VERIFIED',
    'Independent QA and release testing teams', ARRAY['QA','Software Development'], ARRAY['Test Automation','Selenium'], 4000, 30000, 'ironclad-qa-collective', now()),
  ('seed-vendor-10', 'Juniper Content Studio', 'VENDOR', 'PENDING',
    'Technical writing and documentation on contract', ARRAY['Content','Documentation'], ARRAY['Technical Writing','API Docs'], 2500, 18000, 'juniper-content-studio', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. One completed project per vendor, so each has something to have bid on and be reviewed for
-- ---------------------------------------------------------------------------
INSERT INTO sc_projects (id, client_org_id, title, category, status, engagement_model, location_requirement, created_at, updated_at)
SELECT 'seed-project-' || v.n::text, 'seed-client-01', 'Test engagement #' || v.n::text, 'General', 'COMPLETED', 'MARKETPLACE', 'GLOBAL', now(), now()
FROM generate_series(1, 10) AS v(n)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. One accepted bid per vendor against its project (this is the join reviews hang off of)
-- ---------------------------------------------------------------------------
INSERT INTO sc_bids (id, sc_project_id, vendor_org_id, proposed_price, status, created_at, updated_at)
VALUES
  ('seed-bid-01', 'seed-project-1',  'seed-vendor-01', 25000, 'ACCEPTED', now(), now()),
  ('seed-bid-02', 'seed-project-2',  'seed-vendor-02', 40000, 'ACCEPTED', now(), now()),
  ('seed-bid-03', 'seed-project-3',  'seed-vendor-03', 18000, 'ACCEPTED', now(), now()),
  ('seed-bid-04', 'seed-project-4',  'seed-vendor-04', 9000,  'ACCEPTED', now(), now()),
  ('seed-bid-05', 'seed-project-5',  'seed-vendor-05', 32000, 'ACCEPTED', now(), now()),
  ('seed-bid-06', 'seed-project-6',  'seed-vendor-06', 14000, 'ACCEPTED', now(), now()),
  ('seed-bid-07', 'seed-project-7',  'seed-vendor-07', 55000, 'ACCEPTED', now(), now()),
  ('seed-bid-08', 'seed-project-8',  'seed-vendor-08', 6000,  'ACCEPTED', now(), now()),
  ('seed-bid-09', 'seed-project-9',  'seed-vendor-09', 11000, 'ACCEPTED', now(), now()),
  ('seed-bid-10', 'seed-project-10', 'seed-vendor-10', 7000,  'ACCEPTED', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. One client review per vendor -- this is what actually produces "rating" in the UI.
--    Deliberately varied: 5.0 down to 1.0, so search/sort/filter-by-rating has real range.
-- ---------------------------------------------------------------------------
INSERT INTO sc_reviews (id, sc_project_id, from_org_type, rating, comments, created_at) VALUES
  ('seed-review-01', 'seed-project-1',  'CLIENT', 5, 'Excellent delivery, would hire again.', now()),
  ('seed-review-02', 'seed-project-2',  'CLIENT', 5, 'Outstanding communication and results.', now()),
  ('seed-review-03', 'seed-project-3',  'CLIENT', 4, 'Solid work, minor delays.', now()),
  ('seed-review-04', 'seed-project-4',  'CLIENT', 4, 'Good quality, would use again.', now()),
  ('seed-review-05', 'seed-project-5',  'CLIENT', 4, 'Met expectations overall.', now()),
  ('seed-review-06', 'seed-project-6',  'CLIENT', 3, 'Acceptable but communication was slow.', now()),
  ('seed-review-07', 'seed-project-7',  'CLIENT', 3, 'Delivered, but scope crept.', now()),
  ('seed-review-08', 'seed-project-8',  'CLIENT', 2, 'Below expectations, missed deadlines.', now()),
  ('seed-review-09', 'seed-project-9',  'CLIENT', 2, 'Quality issues required rework.', now()),
  ('seed-review-10', 'seed-project-10', 'CLIENT', 1, 'Would not recommend.', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Cleanup: run this whenever you're done testing to remove every row this script created.
-- ---------------------------------------------------------------------------
-- DELETE FROM sc_reviews WHERE id LIKE 'seed-review-%';
-- DELETE FROM sc_bids WHERE id LIKE 'seed-bid-%';
-- DELETE FROM sc_projects WHERE id LIKE 'seed-project-%';
-- DELETE FROM sc_organizations WHERE id LIKE 'seed-vendor-%' OR id LIKE 'seed-client-%';
-- DELETE FROM organizations WHERE id LIKE 'seed-org-%';
