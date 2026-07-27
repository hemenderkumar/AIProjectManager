-- ProjectRequesta has no real customers yet -- every pr_organizations / pr_projects row that
-- exists today is seed/demo data. This flags all of it so the marketplace UI can show a clear
-- "Demo" badge and the bid-creation routes can refuse to let anyone actually bid on it. New
-- rows created afterward through the app (real signups/postings) default to false.

ALTER TABLE pr_organizations ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;
ALTER TABLE pr_projects ADD COLUMN IF NOT EXISTS is_demo_data boolean NOT NULL DEFAULT false;

-- Backfill: everything that exists right now is seed data.
UPDATE pr_organizations SET is_demo_data = true;
UPDATE pr_projects SET is_demo_data = true;
