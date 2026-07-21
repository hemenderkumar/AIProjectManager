-- Links a Keel Deliver task to the KeelConnect marketplace project it was posted as, once a
-- VENDOR-classified task is pushed over via /api/projects/[id]/tasks/[taskId]/post-to-keelconnect.
-- Nullable -- most tasks never get posted. Run once in your Postgres provider's SQL editor.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sc_project_id text REFERENCES sc_projects(id) ON DELETE SET NULL;
