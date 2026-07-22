-- Task dependencies + Gantt/timeline view (#264).

CREATE TABLE IF NOT EXISTS task_dependencies (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_dependency_uq ON task_dependencies (task_id, depends_on_task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_idx ON task_dependencies (depends_on_task_id);
