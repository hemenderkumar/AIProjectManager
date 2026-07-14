-- Login tracking columns on users, plus a lightweight activity_events table for logins
-- and public-link visits (login page, marketing homepage, RFP vendor links).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  user_name text,
  path text,
  detail text,
  created_at timestamp NOT NULL DEFAULT now()
);
