-- Adds two shared starter templates (organization_id NULL) covering the two
-- methodology gaps raised in this session:
--   1. "Agile Software Delivery (Scrum)" -- SCRUM methodology, pre-seeded Sprint 1,
--      story-pointed backlog, Kanban-phase grouping (Backlog vs Sprint 1) -- pairs
--      with the Sprint Board flow metrics / WIP limits / standup-planning-review-retro
--      ceremonies built earlier this session.
--   2. "PRINCE2 Stage-Gated Delivery" -- WATERFALL methodology with PRINCE2 process
--      names as phases (Starting Up, Initiating, Stage Boundary, Closing) and charter
--      text in PRINCE2 vocabulary (Business Case, Benefits Realisation). Recommends
--      turning on Terminology mode: PRINCE2 in Admin settings for the full label set.
--
-- Same idempotent pattern as migrations/seed-standard-templates.sql: INSERT ... SELECT
-- ... WHERE NOT EXISTS, gen_random_uuid()::text id, organization_id NULL (shared/starter).
--
-- Run this once against your Supabase/Postgres database, e.g.:
--   psql "$DATABASE_URL" -f migrations/seed-methodology-templates.sql

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'Agile Software Delivery (Scrum)',
  'A Scrum starter with a pre-seeded Sprint 1, a story-pointed backlog, and Kanban-style phase grouping. Pairs with the Sprint Board flow metrics, WIP limits, and standup, planning, review, and retrospective ceremonies.',
  '{
    "charter": {
      "description": "A cross-functional team delivering working software in short, time-boxed sprints, with a continuously groomed backlog and a Kanban-style board for in-sprint flow.",
      "problemStatement": "Requirements are expected to evolve, so a sequential plan-everything-up-front approach would lock in assumptions that will not hold by the time delivery starts.",
      "proposedSolution": "Run fixed-length sprints with a committed backlog, daily standups, mid-sprint flow tracked on a Kanban board with WIP limits, and a review plus retrospective at the end of each sprint to inspect and adapt.",
      "expectedBenefits": "Faster feedback from real increments, earlier detection of scope or technical risk, and a cadence that surfaces process problems every sprint instead of at the end of the project.",
      "program": "Agile Delivery"
    },
    "executionMethodology": "SCRUM",
    "sprints": [
      { "name": "Sprint 1", "goal": "Establish the team working agreement and ship a thin first increment" }
    ],
    "taskSkeleton": [
      { "title": "Define Definition of Done", "phase": "Backlog", "priority": "MEDIUM", "estimateHours": 2, "storyPoints": 2, "sprintIndex": null },
      { "title": "Groom and estimate initial backlog", "phase": "Backlog", "priority": "HIGH", "estimateHours": 4, "storyPoints": 3, "sprintIndex": null },
      { "title": "Plan Sprint 2 candidate backlog", "phase": "Backlog", "priority": "LOW", "estimateHours": 2, "storyPoints": 2, "sprintIndex": null },
      { "title": "Set up Sprint Board and WIP limits", "phase": "Sprint 1", "priority": "HIGH", "estimateHours": 2, "storyPoints": 2, "sprintIndex": 0 },
      { "title": "Build first user-facing increment", "phase": "Sprint 1", "priority": "HIGH", "estimateHours": 16, "storyPoints": 8, "sprintIndex": 0 },
      { "title": "Wire up CI for the sprint increment", "phase": "Sprint 1", "priority": "MEDIUM", "estimateHours": 6, "storyPoints": 3, "sprintIndex": 0 },
      { "title": "Run daily standups", "phase": "Sprint 1", "priority": "LOW", "estimateHours": 1, "storyPoints": 1, "sprintIndex": 0 },
      { "title": "Prepare Sprint Review demo", "phase": "Sprint 1", "priority": "MEDIUM", "estimateHours": 3, "storyPoints": 2, "sprintIndex": 0 },
      { "title": "Capture Sprint Retrospective actions", "phase": "Sprint 1", "priority": "MEDIUM", "estimateHours": 2, "storyPoints": 1, "sprintIndex": 0 }
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'Agile Software Delivery (Scrum)'
);

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'PRINCE2 Stage-Gated Delivery',
  'A stage-gated starter using PRINCE2 process names as phases (Starting Up, Initiating, Stage Boundary, Closing) and Business Case / Benefits Realisation charter language. Turn on Terminology mode: PRINCE2 in Admin settings to see the matching labels and Highlight / End Stage reports.',
  '{
    "charter": {
      "description": "A stage-gated project run under PRINCE2 controls, with a Business Case owned by the Executive, defined management stages, and formal Stage Boundary reviews before each stage is authorised to proceed.",
      "problemStatement": "Without stage-level gates and a continuously justified Business Case, a project can keep consuming budget after it has stopped being viable.",
      "proposedSolution": "Structure delivery as Starting Up, Initiating, one or more delivery Stages separated by Stage Boundary reviews, and a formal Closing stage, with the Business Case reassessed at each boundary before the next stage is authorised.",
      "expectedBenefits": "Continued business justification at every stage, controlled progress with clear go or no-go decision points, and a documented Benefits Realisation review at closure.",
      "program": "PRINCE2 Governance"
    },
    "executionMethodology": "WATERFALL",
    "taskSkeleton": [
      { "title": "Draft outline Business Case", "phase": "Starting Up a Project (SU)", "priority": "HIGH", "estimateHours": 6, "storyPoints": null, "sprintIndex": null },
      { "title": "Appoint Project Board and Project Manager", "phase": "Starting Up a Project (SU)", "priority": "HIGH", "estimateHours": 3, "storyPoints": null, "sprintIndex": null },
      { "title": "Produce Project Initiation Documentation", "phase": "Initiating a Project (IP)", "priority": "HIGH", "estimateHours": 12, "storyPoints": null, "sprintIndex": null },
      { "title": "Define stage plans and tolerances", "phase": "Initiating a Project (IP)", "priority": "MEDIUM", "estimateHours": 8, "storyPoints": null, "sprintIndex": null },
      { "title": "Deliver Stage 1 products", "phase": "Stage 1: Managing Product Delivery", "priority": "HIGH", "estimateHours": 24, "storyPoints": null, "sprintIndex": null },
      { "title": "Log and escalate stage issues and risks", "phase": "Stage 1: Managing Product Delivery", "priority": "MEDIUM", "estimateHours": 4, "storyPoints": null, "sprintIndex": null },
      { "title": "Prepare End Stage Report and reassess Business Case", "phase": "Stage Boundary Review", "priority": "HIGH", "estimateHours": 6, "storyPoints": null, "sprintIndex": null },
      { "title": "Obtain Project Board authorisation for next stage", "phase": "Stage Boundary Review", "priority": "HIGH", "estimateHours": 2, "storyPoints": null, "sprintIndex": null },
      { "title": "Hand over products and confirm acceptance", "phase": "Closing a Project (CP)", "priority": "MEDIUM", "estimateHours": 5, "storyPoints": null, "sprintIndex": null },
      { "title": "Complete Benefits Realisation review", "phase": "Closing a Project (CP)", "priority": "MEDIUM", "estimateHours": 4, "storyPoints": null, "sprintIndex": null }
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'PRINCE2 Stage-Gated Delivery'
);
