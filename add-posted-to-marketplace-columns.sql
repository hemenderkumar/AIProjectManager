-- Adds the two new columns the split-projectrequesta-out branch's schema.ts expects on `tasks`,
-- replacing the old `pr_project_id` FK (which pointed at `pr_projects`, a table that no longer
-- has any meaning now that ProjectRequesta is a separate app/database). Purely additive and
-- nullable -- safe to run against the shared production DB even before this branch is merged,
-- since the currently-deployed `main` branch doesn't reference these columns at all.
--
-- Does NOT touch pr_project_id or any pr_* table -- that cleanup is a separate, later decision.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS posted_to_marketplace_project_id text,
  ADD COLUMN IF NOT EXISTS posted_to_marketplace_at timestamptz;
