-- Adds the eac_snapshots table: a daily snapshot of the Feature 3 EAC forecast per project,
-- captured opportunistically by /api/forecast/eac (one upsert per project per day) rather than
-- on a cron -- it self-populates from normal Execution page usage. This is what the forecast
-- accuracy tracker (/api/forecast/accuracy) compares against a project's actual final cost
-- once it closes. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS "eac_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "snapshot_date" text NOT NULL,
  "eac" real,
  "actual_cost_to_date" real NOT NULL,
  "physical_percent_complete" real,
  "budget_planned" real NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'eac_snapshot_project_date_uq'
  ) THEN
    CREATE UNIQUE INDEX "eac_snapshot_project_date_uq" ON "eac_snapshots" ("project_id", "snapshot_date");
  END IF;
END $$;
