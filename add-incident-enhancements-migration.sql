-- Incident management enhancements: SLA/MTTR tracking, real user references for
-- assignee/reported-by, an escalation timestamp, a follow-up-task link, and a timeline/
-- comment log. Run once in Supabase's SQL Editor. Safe to run any time -- every new column
-- is nullable, so existing incidents keep working unchanged.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reported_by_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assignee_user_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at timestamp;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at timestamp;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS follow_up_task_id text REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS incident_updates (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
