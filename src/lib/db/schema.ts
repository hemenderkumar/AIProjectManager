import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export const projectStageEnum = pgEnum("project_stage", [
  "INCEPTION",
  "IDEATION",
  "CHARTER",
  "EXECUTION",
  "CLOSING",
  "CLOSED",
]);

export const ragStatusEnum = pgEnum("rag_status", ["GREEN", "YELLOW", "RED"]);

// Ideation redesign: where an idea originates from changes how it should be brainstormed —
// a proactive opportunity needs value-case validation, a problem needs root-cause +
// solution-option comparison before anyone commits to a direction.
export const ideaTypeEnum = pgEnum("idea_type", ["OPPORTUNITY", "PROBLEM"]);

// Lightweight internal progress within the IDEATION stage itself (not a full workflow
// stage change) so an idea's status is visible without adding process overhead.
export const ideationStatusEnum = pgEnum("ideation_status", [
  "EXPLORING",
  "COMPARING_OPTIONS",
  "READY_FOR_CHARTER",
]);

export const priorityEnum = pgEnum("priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
]);

export const commTypeEnum = pgEnum("comm_type", [
  "MEETING",
  "EMAIL",
  "SLACK",
  "CALL",
  "WORKSHOP",
  "OTHER",
]);

export const riskStatusEnum = pgEnum("risk_status", [
  "OPEN",
  "MITIGATING",
  "CLOSED",
  "ACCEPTED",
]);

// Role hierarchy, by visibility scope (not just permission level):
// - ADMIN: platform-wide — sees and manages every organization and every project.
// - SUPER_USER: company-wide — tied to one organization, sees/manages all of that
//   organization's projects (a client-side program lead, or an internal account owner).
// - PM / CONTRIBUTOR / VIEWER: project-specific — see only the individual project(s)
//   they're added to as a member (via project_members), regardless of which organization
//   they belong to. This is what keeps one client's project invisible to another client's
//   users, and (just as importantly) keeps internal staff scoped to what they're staffed on.
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "SUPER_USER",
  "PM",
  "CONTRIBUTOR",
  "VIEWER",
]);

export const statusRequestStatusEnum = pgEnum("status_request_status", [
  "PENDING",
  "COMPLETED",
  "EXPIRED",
]);

export const reportTypeEnum = pgEnum("report_type", [
  "WEEKLY_STATUS",
  "STEERING_COMMITTEE",
]);

export const reportCadenceEnum = pgEnum("report_cadence", [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "MANUAL",
]);

export const costItemCategoryEnum = pgEnum("cost_item_category", [
  "MATERIAL",
  "ONGOING_SUPPORT",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "PENDING",
  "PAID",
  "OVERDUE",
  "DISPUTED",
]);

// Delivery model: how work is sourced (who does it, from where) and how it's priced.
// Rates are org-wide reference data (rate_cards), editable from the Resources page —
// never hardcoded — so they can change as the business's cost structure changes.
export const sourcingTypeEnum = pgEnum("sourcing_type", [
  "ONSITE",
  "OFFSHORE",
  "CONTRACTOR",
]);

export const pricingModelEnum = pgEnum("pricing_model", [
  "FIXED_BID",
  "TIME_AND_MATERIALS",
  "HYBRID",
]);

// How the project is executed day-to-day: a single sequential stage-gate pass (Waterfall),
// iterative sprints (Scrum), or a mix (e.g. stage-gated phases with sprint execution inside
// each phase).
export const executionMethodologyEnum = pgEnum("execution_methodology", [
  "WATERFALL",
  "SCRUM",
  "HYBRID",
]);

// Enterprise-architect sign-off on the AI's recommended technology/architecture direction,
// before an idea is allowed to move into charter drafting.
export const technicalReviewStatusEnum = pgEnum("technical_review_status", [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
]);

export const sprintStatusEnum = pgEnum("sprint_status", [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
]);

const cuid = () => text("id").primaryKey().$defaultFn(() => createId());

export const projects = pgTable("projects", {
  id: cuid(),
  name: text("name").notNull(),
  // Which client company this project is for. Null means "internal-only" — visible to
  // ADMIN and to whichever staff are added as project members, but no organization's
  // SUPER_USER will see it since it isn't tied to their company.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  description: text("description"),
  sponsor: text("sponsor"),
  projectManager: text("project_manager"),
  stage: projectStageEnum("stage").notNull().default("INCEPTION"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  ragStatus: ragStatusEnum("rag_status").notNull().default("GREEN"),
  country: text("country"),
  program: text("program"),
  startDate: timestamp("start_date"),
  targetEndDate: timestamp("target_end_date"),
  actualEndDate: timestamp("actual_end_date"),
  budgetPlanned: real("budget_planned").default(0),
  budgetActual: real("budget_actual").default(0),
  percentComplete: integer("percent_complete").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Ideation
  problemStatement: text("problem_statement"),
  proposedSolution: text("proposed_solution"),
  expectedBenefits: text("expected_benefits"),
  ideationNotes: text("ideation_notes"),
  ideationAlignment: text("ideation_alignment"),
  ideaType: ideaTypeEnum("idea_type"),
  ideationStatus: ideationStatusEnum("ideation_status").notNull().default("EXPLORING"),

  // Technical evaluation & feasibility (Ideation step 2)
  feasibilityScore: integer("feasibility_score"),
  feasibilityNotes: text("feasibility_notes"),

  // Ideation -> Execution approval gate (Ideation step 5)
  stageApprovedBy: text("stage_approved_by"),
  stageApprovedAt: timestamp("stage_approved_at"),

  // Charter
  businessCase: text("business_case"),
  objectives: text("objectives"),
  scopeInScope: text("scope_in_scope"),
  scopeOutOfScope: text("scope_out_of_scope"),
  deliverables: text("deliverables"),
  successCriteria: text("success_criteria"),
  stakeholders: text("stakeholders"),
  assumptionsRisks: text("assumptions_risks"),
  risks: text("risks"),
  totalFundingRequired: real("total_funding_required"),
  integratedSystems: text("integrated_systems"),
  highLevelArchitecture: text("high_level_architecture"),
  roiExpected: text("roi_expected"),
  charterApprovedBy: text("charter_approved_by"),
  charterApprovedAt: timestamp("charter_approved_at"),

  // Cost estimation
  contingencyPercent: real("contingency_percent").default(10),
  ongoingSupportMonthlyCost: real("ongoing_support_monthly_cost"),
  ongoingSupportPlan: text("ongoing_support_plan"),

  // Delivery model & pricing (Delivery & Pricing tab)
  pricingModel: pricingModelEnum("pricing_model"),
  fixedBidPrice: real("fixed_bid_price"),
  deliveryRationale: text("delivery_rationale"),
  deliveryRecommendedAt: timestamp("delivery_recommended_at"),
  executionMethodology: executionMethodologyEnum("execution_methodology").notNull().default("WATERFALL"),

  // Technical recommendation & Enterprise Architect review (Ideation, before Charter)
  recommendedTechnology: text("recommended_technology"),
  technicalRecommendationRationale: text("technical_recommendation_rationale"),
  technicalReviewStatus: technicalReviewStatusEnum("technical_review_status"),
  technicalReviewedBy: text("technical_reviewed_by"),
  technicalReviewedAt: timestamp("technical_reviewed_at"),
  technicalReviewNotes: text("technical_review_notes"),

  // Charter additions
  highLevelRequirements: text("high_level_requirements"),
  architectureDiagram: text("architecture_diagram"), // Mermaid diagram syntax
  internalSupportNeeds: text("internal_support_needs"),
});

export const resources = pgTable("resources", {
  id: cuid(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  capacityHoursPerWk: real("capacity_hours_per_wk").default(40),
  costPerHour: real("cost_per_hour").default(0),
  skills: text("skills").array(),
  experienceYears: real("experience_years"),
  sourcingType: sourcingTypeEnum("sourcing_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Org-wide reference rates by role + sourcing type (Onsite / Offshore / Contractor).
// This is what makes support and project-execution rates changeable in one place instead
// of being hardcoded — the Delivery & Pricing tab and Support Cost Estimator both read
// from here, and it's edited from the Resources page.
export const rateCards = pgTable(
  "rate_cards",
  {
    id: cuid(),
    role: text("role").notNull(),
    sourcingType: sourcingTypeEnum("sourcing_type").notNull().default("ONSITE"),
    hourlyRate: real("hourly_rate").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("rate_card_role_sourcing_uq").on(t.role, t.sourcingType),
  })
);

export const projectResources = pgTable(
  "project_resources",
  {
    id: cuid(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    allocationPercent: integer("allocation_percent").notNull().default(100),
  },
  (t) => ({
    uq: uniqueIndex("project_resource_uq").on(t.projectId, t.resourceId),
  })
);

export const tasks = pgTable("tasks", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("TODO"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  assigneeId: text("assignee_id").references(() => resources.id),
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  estimateHours: real("estimate_hours").default(0),
  actualHours: real("actual_hours").default(0),
  requiredSkills: text("required_skills").array(),
  requiredExperienceYears: real("required_experience_years"),
  isAgentTask: boolean("is_agent_task").notNull().default(false),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // SDLC phase (free text so it can flex across project types: Scoping, Requirements,
  // Design, Development, Testing, UAT, Deployment, Closure, or a research/physical-work
  // equivalent) and, for Scrum/Hybrid execution, sprint assignment + story points.
  phase: text("phase"),
  sprintId: text("sprint_id").references((): AnyPgColumn => sprints.id, { onDelete: "set null" }),
  storyPoints: real("story_points"),
});

// Iteration containers for Scrum/Hybrid execution. Kept separate from milestones (which
// are date-based delivery markers) — a sprint is a fixed-length work container tasks get
// assigned into, with its own goal and status.
export const sprints = pgTable("sprints", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  goal: text("goal"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: sprintStatusEnum("status").notNull().default("PLANNED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const statusUpdates = pgTable("status_updates", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull().defaultNow(),
  ragStatus: ragStatusEnum("rag_status").notNull().default("GREEN"),
  percentComplete: integer("percent_complete").notNull().default(0),
  summary: text("summary"),
  accomplishments: text("accomplishments"),
  upcoming: text("upcoming"),
  blockers: text("blockers"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const communicationLogs = pgTable("communication_logs", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull().defaultNow(),
  type: commTypeEnum("type").notNull().default("MEETING"),
  summary: text("summary"),
  participants: text("participants"),
  actionItems: text("action_items"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const riskItems = pgTable("risk_items", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  impact: priorityEnum("impact").notNull().default("MEDIUM"),
  likelihood: priorityEnum("likelihood").notNull().default("MEDIUM"),
  mitigation: text("mitigation"),
  owner: text("owner"),
  status: riskStatusEnum("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  status: taskStatusEnum("status").notNull().default("TODO"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A client company (tenant). Internal staff (your own team) have organizationId = null on
// their user row and are not "in" any organization; every client-side user belongs to
// exactly one. Every project optionally belongs to one organization (the client it's for).
export const organizations = pgTable("organizations", {
  id: cuid(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: cuid(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("VIEWER"),
  resourceId: text("resource_id").references(() => resources.id),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    id: cuid(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("project_member_uq").on(t.projectId, t.userId),
  })
);

export const statusRequests = pgTable("status_requests", {
  id: cuid(),
  token: text("token").notNull().unique(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  resourceId: text("resource_id")
    .notNull()
    .references(() => resources.id),
  status: statusRequestStatusEnum("status").notNull().default("PENDING"),
  message: text("message"),
  responseText: text("response_text"),
  emailedAt: timestamp("emailed_at"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: cuid(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: reportTypeEnum("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const costItems = pgTable("cost_items", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: costItemCategoryEnum("category").notNull().default("MATERIAL"),
  name: text("name").notNull(),
  amount: real("amount").notNull().default(0),
  isRecurring: boolean("is_recurring").notNull().default(false),
  cadence: text("cadence"), // free text: "one-time", "monthly", "annual", etc.
  notes: text("notes"),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  vendor: text("vendor").notNull(),
  invoiceNumber: text("invoice_number"),
  amount: real("amount").notNull().default(0),
  invoiceDate: timestamp("invoice_date"),
  dueDate: timestamp("due_date"),
  status: invoiceStatusEnum("status").notNull().default("PENDING"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: cuid(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").references(() => resources.id),
  hours: real("hours").notNull().default(0),
  entryDate: timestamp("entry_date").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const incidentStatusEnum = pgEnum("incident_status", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);

// Ongoing Support: a standalone, portfolio-wide incident/issue queue — not scoped to a
// single project's tabs. projectId is optional since an incident may not tie to any
// specific project (e.g. shared infrastructure); set null rather than cascade-delete so
// incident history survives a project being removed.
export const incidents = pgTable("incidents", {
  id: cuid(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  severity: priorityEnum("severity").notNull().default("MEDIUM"),
  status: incidentStatusEnum("status").notNull().default("OPEN"),
  reportedBy: text("reported_by"),
  assignee: text("assignee"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  aiRecommendation: text("ai_recommendation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Running ideation brainstorm log: a dated, append-only list of entries (AI-generated or
// manual notes) so an idea's thinking is preserved across multiple sessions instead of
// being overwritten by the latest AI call.
export const brainstormEntrySourceEnum = pgEnum("brainstorm_entry_source", ["AI", "MANUAL"]);

export const brainstormEntries = pgTable("brainstorm_entries", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  source: brainstormEntrySourceEnum("source").notNull().default("MANUAL"),
  author: text("author"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Candidate solution approaches for Problem-type ideas — a lightweight side-by-side
// comparison so a team compares options before committing to one, rather than jumping
// straight to a single proposed solution.
export const solutionOptions = pgTable("solution_options", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  pros: text("pros"),
  cons: text("cons"),
  feasibilityNotes: text("feasibility_notes"),
  isSelected: boolean("is_selected").notNull().default(false),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-project sourcing breakdown for the Delivery & Pricing tab: one row per role,
// with what % of that role's hours are onsite vs offshore vs contractor. Hours and
// percentages are deterministic/editable; only the initial split + rationale come from
// the AI recommendation (createdByAi), same "AI proposes, math computes" pattern used
// by the Support Cost Estimator.
export const deliveryRoleMix = pgTable("delivery_role_mix", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  hours: real("hours").notNull().default(0),
  onsitePercent: real("onsite_percent").notNull().default(100),
  offshorePercent: real("offshore_percent").notNull().default(0),
  contractorPercent: real("contractor_percent").notNull().default(0),
  rationale: text("rationale"),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  weeklyReportCadence: reportCadenceEnum("weekly_report_cadence").notNull().default("WEEKLY"),
  steeringCadence: reportCadenceEnum("steering_cadence").notNull().default("MONTHLY"),
  avatarVoiceGender: text("avatar_voice_gender").notNull().default("female"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-only record of sensitive/high-stakes actions — approvals, reviews, rate changes,
// deletions — so a decision can be traced back to who made it and when. Deliberately
// generic (entityType/entityId/action, free-text detail) rather than one table per action
// type, so new audited actions don't need a schema change.
export const auditLog = pgTable("audit_log", {
  id: cuid(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name"), // snapshot in case the user is later deleted
  action: text("action").notNull(), // e.g. "charter.approved", "technical_review.approved", "rate_card.updated", "organization.deleted"
  entityType: text("entity_type"), // e.g. "project", "rate_card", "organization"
  entityId: text("entity_id"),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  detail: text("detail"), // free-text description of what changed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const projectsRelations = relations(projects, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
  resources: many(projectResources),
  statusUpdates: many(statusUpdates),
  communications: many(communicationLogs),
  risks: many(riskItems),
  milestones: many(milestones),
  costItems: many(costItems),
  invoices: many(invoices),
  incidents: many(incidents),
  brainstormEntries: many(brainstormEntries),
  solutionOptions: many(solutionOptions),
  deliveryRoleMix: many(deliveryRoleMix),
  sprints: many(sprints),
}));

export const resourcesRelations = relations(resources, ({ many }) => ({
  projects: many(projectResources),
  tasks: many(tasks),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  projects: many(projects),
}));

export const deliveryRoleMixRelations = relations(deliveryRoleMix, ({ one }) => ({
  project: one(projects, {
    fields: [deliveryRoleMix.projectId],
    references: [projects.id],
  }),
}));

export const projectResourcesRelations = relations(projectResources, ({ one }) => ({
  project: one(projects, {
    fields: [projectResources.projectId],
    references: [projects.id],
  }),
  resource: one(resources, {
    fields: [projectResources.resourceId],
    references: [resources.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(resources, {
    fields: [tasks.assigneeId],
    references: [resources.id],
  }),
  sprint: one(sprints, {
    fields: [tasks.sprintId],
    references: [sprints.id],
  }),
  timeEntries: many(timeEntries),
}));

export const sprintsRelations = relations(sprints, ({ one, many }) => ({
  project: one(projects, {
    fields: [sprints.projectId],
    references: [projects.id],
  }),
  tasks: many(tasks),
}));

export const costItemsRelations = relations(costItems, ({ one }) => ({
  project: one(projects, {
    fields: [costItems.projectId],
    references: [projects.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  task: one(tasks, {
    fields: [timeEntries.taskId],
    references: [tasks.id],
  }),
  resource: one(resources, {
    fields: [timeEntries.resourceId],
    references: [resources.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  project: one(projects, {
    fields: [incidents.projectId],
    references: [projects.id],
  }),
}));

export const brainstormEntriesRelations = relations(brainstormEntries, ({ one }) => ({
  project: one(projects, {
    fields: [brainstormEntries.projectId],
    references: [projects.id],
  }),
}));

export const solutionOptionsRelations = relations(solutionOptions, ({ one }) => ({
  project: one(projects, {
    fields: [solutionOptions.projectId],
    references: [projects.id],
  }),
}));

export const statusUpdatesRelations = relations(statusUpdates, ({ one }) => ({
  project: one(projects, {
    fields: [statusUpdates.projectId],
    references: [projects.id],
  }),
}));

export const communicationLogsRelations = relations(communicationLogs, ({ one }) => ({
  project: one(projects, {
    fields: [communicationLogs.projectId],
    references: [projects.id],
  }),
}));

export const riskItemsRelations = relations(riskItems, ({ one }) => ({
  project: one(projects, {
    fields: [riskItems.projectId],
    references: [projects.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  projectMemberships: many(projectMembers),
  resource: one(resources, {
    fields: [users.resourceId],
    references: [resources.id],
  }),
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const statusRequestsRelations = relations(statusRequests, ({ one }) => ({
  project: one(projects, {
    fields: [statusRequests.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [statusRequests.taskId],
    references: [tasks.id],
  }),
  resource: one(resources, {
    fields: [statusRequests.resourceId],
    references: [resources.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
}));
