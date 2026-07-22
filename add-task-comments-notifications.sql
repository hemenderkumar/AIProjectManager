-- Task comments + @mentions + notifications/digest (#262).

CREATE TABLE IF NOT EXISTS task_comments (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id text REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (task_id);

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('MENTION', 'COMMENT', 'DIGEST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at);
