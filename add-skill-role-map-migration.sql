-- Adds the skill_role_map table: a plain skill -> role lookup used by the skill capacity
-- forecast (lib/forecast.ts's computeSkillCapacityForecast) to price an uncovered skill gap
-- against a real rate-card role instead of treating the skill name itself as a role. Global,
-- not org-scoped -- "React maps to Frontend Engineer" is a taxonomy fact, not something that
-- differs per client. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS "skill_role_map" (
  "id" text PRIMARY KEY NOT NULL,
  "skill" text NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'skill_role_map_skill_uq'
  ) THEN
    CREATE UNIQUE INDEX "skill_role_map_skill_uq" ON "skill_role_map" ("skill");
  END IF;
END $$;
