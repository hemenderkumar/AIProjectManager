-- Self-service and admin-initiated password resets: a one-time, expiring tokenized link
-- (same pattern as status_requests), instead of an admin having to invent/communicate a
-- password directly.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
