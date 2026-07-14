-- Who/what executes a task: AI-doable, internal team, or external vendor. Suggested by AI
-- at task creation (bulk project planning + single-task Draft with AI), always editable.
DO $$ BEGIN
  CREATE TYPE task_execution_source AS ENUM ('AI', 'INTERNAL', 'VENDOR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_source task_execution_source;
