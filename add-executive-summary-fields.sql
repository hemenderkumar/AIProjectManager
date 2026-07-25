-- Adds the executive_summary column used by the new "Executive Summary" section on
-- Charter, SOW, and Deliverables. Run this once against production.
--
-- (projects.executive_summary was already added and shipped with the Charter changes in a
-- prior commit -- included here again with IF NOT EXISTS so this file is safe to run
-- standalone even if that one's already applied.)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS executive_summary text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS executive_summary text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS executive_summary text;
