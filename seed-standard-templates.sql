-- Seeds standard, shared starter project templates (organization_id NULL = usable by any
-- organization, same convention as roadmaps). Safe to run any time: guarded by a name +
-- NULL-org existence check per template, so re-running does not create duplicates.
-- Run once in Supabase's SQL Editor.

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'Software Delivery',
  'A standard SDLC skeleton for building and shipping a software feature or application, from requirements through go-live.',
  '{
    "charter": {
      "description": "Deliver a new software capability from requirements through production release.",
      "problemStatement": "Describe the user or business problem this software will solve.",
      "proposedSolution": "Describe the proposed technical approach at a high level.",
      "expectedBenefits": "Describe the expected efficiency, revenue, or experience gains.",
      "program": null
    },
    "taskSkeleton": [
      {"title": "Gather and document requirements", "phase": "Requirements", "priority": "HIGH", "estimateHours": 16},
      {"title": "Define technical architecture", "phase": "Design", "priority": "HIGH", "estimateHours": 16},
      {"title": "Design UI/UX mockups", "phase": "Design", "priority": "MEDIUM", "estimateHours": 12},
      {"title": "Set up project scaffolding and CI/CD", "phase": "Development", "priority": "MEDIUM", "estimateHours": 8},
      {"title": "Build core functionality", "phase": "Development", "priority": "HIGH", "estimateHours": 40},
      {"title": "Write unit and integration tests", "phase": "Development", "priority": "HIGH", "estimateHours": 16},
      {"title": "Conduct code review", "phase": "Development", "priority": "MEDIUM", "estimateHours": 6},
      {"title": "Perform QA testing", "phase": "Testing", "priority": "HIGH", "estimateHours": 20},
      {"title": "User acceptance testing (UAT)", "phase": "Testing", "priority": "HIGH", "estimateHours": 12},
      {"title": "Fix defects from testing", "phase": "Testing", "priority": "MEDIUM", "estimateHours": 12},
      {"title": "Prepare deployment runbook", "phase": "Deployment", "priority": "MEDIUM", "estimateHours": 4},
      {"title": "Deploy to production", "phase": "Deployment", "priority": "CRITICAL", "estimateHours": 6},
      {"title": "Monitor post-launch and address issues", "phase": "Deployment", "priority": "HIGH", "estimateHours": 8}
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'Software Delivery'
);

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'Infrastructure / IT Migration',
  'A standard skeleton for migrating systems, data, or infrastructure to a new platform or environment.',
  '{
    "charter": {
      "description": "Migrate existing infrastructure or systems to a new platform with minimal disruption.",
      "problemStatement": "Describe why the current infrastructure needs to change (cost, risk, end-of-life, scalability).",
      "proposedSolution": "Describe the target platform and migration approach.",
      "expectedBenefits": "Describe expected cost savings, reliability, or performance gains.",
      "program": null
    },
    "taskSkeleton": [
      {"title": "Inventory current systems and dependencies", "phase": "Assessment", "priority": "HIGH", "estimateHours": 16},
      {"title": "Assess risks and compliance requirements", "phase": "Assessment", "priority": "HIGH", "estimateHours": 8},
      {"title": "Design target architecture", "phase": "Planning", "priority": "HIGH", "estimateHours": 16},
      {"title": "Define migration and rollback plan", "phase": "Planning", "priority": "HIGH", "estimateHours": 8},
      {"title": "Provision target environment", "phase": "Build", "priority": "HIGH", "estimateHours": 16},
      {"title": "Migrate non-production data/workloads", "phase": "Build", "priority": "MEDIUM", "estimateHours": 20},
      {"title": "Validate non-production migration", "phase": "Testing", "priority": "HIGH", "estimateHours": 12},
      {"title": "Performance and security testing", "phase": "Testing", "priority": "HIGH", "estimateHours": 12},
      {"title": "Schedule and communicate cutover window", "phase": "Cutover", "priority": "MEDIUM", "estimateHours": 4},
      {"title": "Execute production cutover", "phase": "Cutover", "priority": "CRITICAL", "estimateHours": 12},
      {"title": "Post-cutover validation and monitoring", "phase": "Cutover", "priority": "CRITICAL", "estimateHours": 8},
      {"title": "Decommission legacy systems", "phase": "Closeout", "priority": "MEDIUM", "estimateHours": 6}
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'Infrastructure / IT Migration'
);

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'Marketing Campaign / Product Launch',
  'A standard skeleton for planning and executing a marketing campaign or product launch.',
  '{
    "charter": {
      "description": "Plan, produce, and launch a marketing campaign or product to drive awareness and adoption.",
      "problemStatement": "Describe the market opportunity or gap this campaign/launch addresses.",
      "proposedSolution": "Describe the campaign concept, channels, and target audience.",
      "expectedBenefits": "Describe expected reach, leads, or revenue impact.",
      "program": null
    },
    "taskSkeleton": [
      {"title": "Define target audience and positioning", "phase": "Strategy", "priority": "HIGH", "estimateHours": 8},
      {"title": "Set campaign goals and success metrics", "phase": "Strategy", "priority": "HIGH", "estimateHours": 4},
      {"title": "Develop creative brief and messaging", "phase": "Planning", "priority": "HIGH", "estimateHours": 8},
      {"title": "Plan channel mix and budget", "phase": "Planning", "priority": "MEDIUM", "estimateHours": 6},
      {"title": "Produce creative assets (copy, design, video)", "phase": "Production", "priority": "HIGH", "estimateHours": 24},
      {"title": "Build landing page / campaign site", "phase": "Production", "priority": "MEDIUM", "estimateHours": 16},
      {"title": "Set up tracking and analytics", "phase": "Production", "priority": "MEDIUM", "estimateHours": 6},
      {"title": "Internal review and legal/brand approval", "phase": "Production", "priority": "MEDIUM", "estimateHours": 4},
      {"title": "Launch campaign across channels", "phase": "Launch", "priority": "CRITICAL", "estimateHours": 8},
      {"title": "Monitor performance and optimize", "phase": "Launch", "priority": "HIGH", "estimateHours": 12},
      {"title": "Compile post-campaign results report", "phase": "Closeout", "priority": "MEDIUM", "estimateHours": 6}
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'Marketing Campaign / Product Launch'
);

INSERT INTO project_templates (id, organization_id, name, description, snapshot, created_by)
SELECT gen_random_uuid()::text, NULL,
  'Process Improvement',
  'A standard skeleton for analyzing and improving an existing business process.',
  '{
    "charter": {
      "description": "Analyze and redesign an existing process to remove waste, cost, or delay.",
      "problemStatement": "Describe the pain points or inefficiencies in the current process.",
      "proposedSolution": "Describe the proposed redesigned process or tooling.",
      "expectedBenefits": "Describe the expected time, cost, or quality improvement.",
      "program": null
    },
    "taskSkeleton": [
      {"title": "Map current-state process", "phase": "Discovery", "priority": "HIGH", "estimateHours": 12},
      {"title": "Identify bottlenecks and root causes", "phase": "Discovery", "priority": "HIGH", "estimateHours": 8},
      {"title": "Interview process stakeholders", "phase": "Discovery", "priority": "MEDIUM", "estimateHours": 8},
      {"title": "Design future-state process", "phase": "Design", "priority": "HIGH", "estimateHours": 12},
      {"title": "Define success metrics and controls", "phase": "Design", "priority": "MEDIUM", "estimateHours": 4},
      {"title": "Build or configure supporting tooling", "phase": "Implementation", "priority": "MEDIUM", "estimateHours": 16},
      {"title": "Pilot new process with one team", "phase": "Implementation", "priority": "HIGH", "estimateHours": 8},
      {"title": "Train affected teams", "phase": "Rollout", "priority": "MEDIUM", "estimateHours": 8},
      {"title": "Roll out process organization-wide", "phase": "Rollout", "priority": "HIGH", "estimateHours": 8},
      {"title": "Measure results against baseline", "phase": "Closeout", "priority": "MEDIUM", "estimateHours": 6}
    ]
  }'::jsonb,
  'Executa'
WHERE NOT EXISTS (
  SELECT 1 FROM project_templates WHERE organization_id IS NULL AND name = 'Process Improvement'
);
