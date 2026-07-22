-- Slack notifications + calendar (.ics) feed integrations (#263).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS slack_webhook_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ics_token text;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_ics_token_unique UNIQUE (ics_token);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
