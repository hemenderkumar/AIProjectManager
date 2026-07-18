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

// Who/what actually executes a task, suggested by AI at creation time (bulk project
// planning or the single-task "Draft with AI") and always editable by a human: "AI" for
// work Keel's AI can do directly (drafting, generating, analyzing), "INTERNAL" for work
// the delivery team must do themselves, "VENDOR" for work that needs an external
// vendor/contractor. Nullable -- existing tasks and anything created without a
// suggestion simply have no classification yet, not a wrong default.
export const taskExecutionSourceEnum = pgEnum("task_execution_source", ["AI", "INTERNAL", "VENDOR"]);

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

export const issueStatusEnum = pgEnum("issue_status", ["OPEN", "IN_PROGRESS", "RESOLVED", "WONT_FIX"]);

export const statusRequestStatusEnum = pgEnum("status_request_status", [
  "PENDING",
  "COMPLETED",
  "EXPIRED",
]);

// Self-service sign-up: anyone can submit one of these without a login, but nothing in
// `users` is created until an ADMIN approves it. "INDIVIDUAL" gets a personal organization
// auto-created on approval (see approve route) so they read as a normal client-side user —
// never as internal staff — without needing a real company. "COMPANY_OWNER" gets a brand
// new organization + SUPER_USER on approval, mirroring the existing admin "New Company" flow.
export const registrationTypeEnum = pgEnum("registration_type", [
  "INDIVIDUAL",
  "COMPANY_OWNER",
]);

export const registrationStatusEnum = pgEnum("registration_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
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

export const rfpStatusEnum = pgEnum("rfp_status", [
  "DRAFT",
  "PUBLISHED",
  "EVALUATING",
  "AWARDED",
  "CLOSED",
]);

export const vendorResponseStatusEnum = pgEnum("vendor_response_status", [
  "INVITED",
  "VIEWED",
  "SUBMITTED",
  "DECLINED",
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
  // Structured sponsor mapping: when set, this is the source of truth and `sponsor` above
  // is kept as a denormalized copy of the stakeholder's name so every existing consumer
  // (AI prompts, charter/report exports) that already reads the plain `sponsor` text field
  // keeps working unchanged. Null for internal-only projects (stakeholders are org-scoped)
  // or organizations that haven't set up a stakeholder directory yet.
  sponsorStakeholderId: text("sponsor_stakeholder_id").references((): AnyPgColumn => stakeholders.id, { onDelete: "set null" }),
  projectManager: text("project_manager"),
  stage: projectStageEnum("stage").notNull().default("INCEPTION"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  ragStatus: ragStatusEnum("rag_status").notNull().default("GREEN"),
  country: text("country"),
  stateProvince: text("state_province"),
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

// Reference rates by role + sourcing type (Onsite / Offshore / Contractor). Scoped by
// organizationId: null = Keel's own internal default list (used for internal/Keel-run
// projects, and as a fallback wherever a client company hasn't set its own rates yet);
// non-null = that specific client company's own rates, visible/editable only to their
// SUPER_USER and to ADMIN — never to another company, and never to a project-scoped user
// (PM/CONTRIBUTOR/VIEWER), including a self-registered "individual" account. This is what
// makes support and project-execution rates changeable in one place instead of being
// hardcoded — the Delivery & Pricing tab and Support Cost Estimator both read from here.
export const rateCards = pgTable(
  "rate_cards",
  {
    id: cuid(),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    sourcingType: sourcingTypeEnum("sourcing_type").notNull().default("ONSITE"),
    hourlyRate: real("hourly_rate").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("rate_card_org_role_sourcing_uq").on(t.organizationId, t.role, t.sourcingType),
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
  executionSource: taskExecutionSourceEnum("execution_source"),
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
  // Set when this milestone came from an SOW's contractual milestone list (AI-drafted or
  // owner-added) rather than being added directly on the Milestones tab — lets a milestone
  // show up in both places (one shared list) instead of maintaining a separate SOW-only
  // milestones table.
  sowId: text("sow_id").references((): AnyPgColumn => sows.id, { onDelete: "cascade" }),
});

// A client company (tenant). Internal staff (your own team) have organizationId = null on
// their user row and are not "in" any organization; every client-side user belongs to
// exactly one. Every project optionally belongs to one organization (the client it's for).
export const organizations = pgTable("organizations", {
  id: cuid(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // Data export & deletion self-service (Request -> Admin confirms flow): a SUPER_USER
  // requests deletion of their own organization's data; nothing is actually deleted until
  // an ADMIN reviews and confirms (or dismisses) the request. Null/null means no pending
  // request.
  deletionRequestedAt: timestamp("deletion_requested_at"),
  deletionRequestedBy: text("deletion_requested_by"), // snapshot of requester's name/email
});

// A department/business unit within one client organization (e.g. "Finance", "Operations").
// Company-owner-managed (add/remove from the My Organization page) so a SUPER_USER can
// organize their own team and stakeholders without needing Keel support to do it for them.
export const divisions = pgTable(
  "divisions",
  {
    id: cuid(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("division_org_name_uq").on(t.organizationId, t.name),
  })
);

// A named business stakeholder at a client organization (not necessarily a Keel login —
// most project sponsors are executives who never touch the tool themselves). Structured
// so the same person can be picked as sponsor across multiple projects and carries their
// division with them, instead of re-typing a name as free text every time.
export const stakeholders = pgTable("stakeholders", {
  id: cuid(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  divisionId: text("division_id").references(() => divisions.id, { onDelete: "set null" }),
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
  // Which division of their organization this teammate sits in — set by the company
  // owner from the My Organization team list. Null for internal staff (divisions are a
  // client-organization concept) and for client users not yet assigned one.
  divisionId: text("division_id").references(() => divisions.id, { onDelete: "set null" }),
  lastLoginAt: timestamp("last_login_at"),
  loginCount: integer("login_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A pending sign-up submitted through the public /register page. The password is hashed at
// submission time (never stored in plain text) so approval only needs to copy it over into
// the real `users` row rather than asking the person to set a password twice. Rejected/
// pending rows never grant any access — only an APPROVED row (via the admin approve route)
// results in a real login.
export const registrationRequests = pgTable("registration_requests", {
  id: cuid(),
  type: registrationTypeEnum("type").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  // Only set (and only relevant) for COMPANY_OWNER requests.
  companyName: text("company_name"),
  status: registrationStatusEnum("status").notNull().default("PENDING"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"), // snapshot of the admin's name, not a hard FK
  // Populated once approved, so the request row keeps a permanent record of what it created.
  resultingUserId: text("resulting_user_id").references(() => users.id, { onDelete: "set null" }),
  resultingOrganizationId: text("resulting_organization_id").references(() => organizations.id, { onDelete: "set null" }),
});

// Self-service and admin-initiated password resets. Same tokenized-link pattern as
// statusRequests (a random opaque token, not a JWT, so it can be looked up and invalidated
// server-side) rather than reusing the session-token machinery in auth.ts, which is meant
// for logged-in sessions, not one-time unauthenticated actions.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: cuid(),
  token: text("token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
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

// Lightweight record of "someone showed up" events — logins, and visits to public/no-login
// links (the marketing homepage, the login page, a vendor's RFP response link). Separate
// from auditLog on purpose: auditLog is for tracing who made a sensitive business decision;
// this is just traffic/usage counting and would otherwise drown that out.
export const activityEvents = pgTable("activity_events", {
  id: cuid(),
  type: text("type").notNull(), // "LOGIN" | "PUBLIC_VISIT"
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name"), // snapshot in case the user is later deleted
  path: text("path"), // e.g. "/", "/login", "/rfp/respond/<token>"
  detail: text("detail"), // e.g. an RFP title or vendor name for a public visit
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User-reported bugs/feedback, captured with an automatic client-side screenshot of the
// page they were on (data URL, taken via html2canvas in the browser — no server-side
// rendering needed). Any logged-in user can file one from anywhere in the app via the
// floating "Report an issue" button; only ADMIN can see the resulting list (the event log
// at /admin/issues). Deliberately its own table rather than reusing auditLog: auditLog is
// an append-only trace of sensitive actions someone took, this is inbound reports that get
// triaged and closed out, with a mutable status.
export const issueReports = pgTable("issue_reports", {
  id: cuid(),
  reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reporterName: text("reporter_name"), // snapshot in case the user is later deleted
  reporterEmail: text("reporter_email"),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  pagePath: text("page_path").notNull(), // e.g. "/projects/abc123" — where they were when they reported it
  description: text("description").notNull(),
  screenshotDataUrl: text("screenshot_data_url"), // "data:image/png;base64,..." — null if capture failed client-side
  status: issueStatusEnum("status").notNull().default("OPEN"),
  resolvedBy: text("resolved_by"), // snapshot name of the admin who closed it out
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Vendor Evaluation (RFP) module ---
// A company owner (SUPER_USER) builds an RFP — either auto-drafted from a project's
// completed charter, or from a handful of pointers the owner types in when there's no
// project/charter yet — invites vendors by email (no-login, tokenized response link, same
// pattern as the existing status-request flow), collects their proposals, then has the AI
// score each vendor against a weighted rubric and recommend one. Standalone by design: an
// RFP may or may not be linked to a project, and can exist before a project is ever created.

export const rfps = pgTable("rfps", {
  id: cuid(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Optional — an RFP can be created standalone, before any project exists, or linked to
  // one later. If linked to a project with a completed charter, the charter's own fields
  // are what seed the AI draft.
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: rfpStatusEnum("status").notNull().default("DRAFT"),

  // Inputs — either pulled from the linked project's charter, or typed in directly by the
  // owner when there's no charter to draw from.
  background: text("background"),
  scope: text("scope"),
  requirements: text("requirements"),
  timeline: text("timeline"),
  budgetRange: text("budget_range"),

  // The full AI-drafted (or owner-edited) RFP document vendors actually see.
  content: text("content"),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdBy: text("created_by"), // snapshot of the owner's name
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  publishedAt: timestamp("published_at"),
});

// Weighted scoring rubric, defined by the company owner per RFP (some fields — the
// criteria and their weights — are exactly the "owner-editable fields" called for).
export const rfpCriteria = pgTable("rfp_criteria", {
  id: cuid(),
  rfpId: text("rfp_id")
    .notNull()
    .references(() => rfps.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Cost", "Timeline", "Technical Fit"
  weightPercent: real("weight_percent").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per invited vendor. `token` is the sole credential for the vendor's no-login
// response link — treat it like a password: a vendor's link must only ever resolve their
// own row, never another vendor's, and must never expose the scoring rubric or any other
// vendor's response.
export const rfpVendors = pgTable("rfp_vendors", {
  id: cuid(),
  rfpId: text("rfp_id")
    .notNull()
    .references(() => rfps.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // vendor company name
  contactName: text("contact_name"),
  contactEmail: text("contact_email").notNull(),
  token: text("token").notNull().unique(),
  status: vendorResponseStatusEnum("status").notNull().default("INVITED"),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  viewedAt: timestamp("viewed_at"),
  responseText: text("response_text"), // vendor's submitted proposed solution
  proposedCost: real("proposed_cost"),
  proposedTimelineWeeks: real("proposed_timeline_weeks"),
  submittedAt: timestamp("submitted_at"),
});

// AI-generated per-criterion score for one vendor. createdByAi is always true today (there's
// no manual override UI yet) but the flag is kept for the same "AI proposes" convention
// used elsewhere (delivery role mix, cost items) in case manual adjustment is added later.
export const rfpVendorScores = pgTable(
  "rfp_vendor_scores",
  {
    id: cuid(),
    rfpVendorId: text("rfp_vendor_id")
      .notNull()
      .references(() => rfpVendors.id, { onDelete: "cascade" }),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => rfpCriteria.id, { onDelete: "cascade" }),
    score: real("score").notNull().default(0), // 0-10
    rationale: text("rationale"),
    createdByAi: boolean("created_by_ai").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("rfp_vendor_score_uq").on(t.rfpVendorId, t.criterionId),
  })
);

// One overall AI recommendation per RFP — re-generated (overwritten) each time the owner
// re-runs evaluation, so there's always exactly one current recommendation, not a growing
// history of stale ones.
export const rfpRecommendations = pgTable("rfp_recommendations", {
  id: cuid(),
  rfpId: text("rfp_id")
    .notNull()
    .references(() => rfps.id, { onDelete: "cascade" })
    .unique(),
  recommendedVendorId: text("recommended_vendor_id").references(() => rfpVendors.id, { onDelete: "set null" }),
  summary: text("summary"), // AI-generated overall comparison + rationale
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

// Statement of Work: the formal contract document between the company and a vendor for a
// specific project, created by the company owner once a charter and plan exist. Deliberately
// its own table rather than reusing charter fields — a charter describes the project to
// yourselves, an SOW is the contractual document exchanged with a vendor, and a project can
// have more than one SOW (different vendors, or renewals/amendments over time). Optionally
// linked to a vendor already evaluated through the RFP module (rfpVendorId), but doesn't
// require one — an owner with an existing vendor relationship can create one directly.
export const sowStatusEnum = pgEnum("sow_status", [
  "DRAFT",
  "APPROVED",
  "PENDING_SIGNATURE",
  "SIGNED",
  "ACTIVE",
  "COMPLETED",
  "TERMINATED",
]);

export const sows = pgTable("sows", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  rfpVendorId: text("rfp_vendor_id").references(() => rfpVendors.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  vendorName: text("vendor_name").notNull(),
  vendorContactName: text("vendor_contact_name"),
  vendorContactEmail: text("vendor_contact_email"),
  status: sowStatusEnum("status").notNull().default("DRAFT"),

  scope: text("scope"),
  deliverablesSummary: text("deliverables_summary"),
  timeline: text("timeline"),
  fundingAmount: real("funding_amount"),
  fundingTerms: text("funding_terms"),
  risks: text("risks"),
  issues: text("issues"),

  // The full AI-drafted (or owner-edited) SOW document text.
  content: text("content"),
  createdByAi: boolean("created_by_ai").notNull().default(false),

  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at"),

  // Internal review/approval — a separate moment from the vendor's own signature above.
  // Stamped server-side only when status transitions to APPROVED, never client-supplied.
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),

  // The executed contract, scanned/exported as a PDF and attached back onto this SOW —
  // stored inline as base64 rather than in external object storage, so no additional service
  // (S3, Vercel Blob, etc.) needs to be provisioned to use this. Fine for the size of a typical
  // signed contract; would need to move to blob storage if attachments grow much larger.
  signedDocumentFilename: text("signed_document_filename"),
  signedDocumentData: text("signed_document_data"), // base64-encoded PDF bytes
  signedDocumentUploadedAt: timestamp("signed_document_uploaded_at"),
  signedDocumentUploadedBy: text("signed_document_uploaded_by"),

  createdBy: text("created_by"), // snapshot of the owner's name
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Working deliverable documents for a project, generated with AI from the charter/plan and
// then reviewed/edited by the team. Five specific types were called for; OTHER exists so the
// same tab can hold anything else worth attaching without inventing a new type each time.
export const deliverableTypeEnum = pgEnum("deliverable_type", [
  "REQUIREMENTS_NFR",
  "DESIGN",
  "FUNCTIONAL_TEST_SCRIPT",
  "UAT_SCRIPT",
  "RELEASE_DOCUMENTATION",
  "OTHER",
]);

export const deliverableStatusEnum = pgEnum("deliverable_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "FINAL",
]);

export const deliverables = pgTable("deliverables", {
  id: cuid(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: deliverableTypeEnum("type").notNull(),
  title: text("title").notNull(),
  // Document body (markdown) — populated for the narrative types (requirements/NFR, design,
  // release documentation, other). The two test-script types instead use structured rows in
  // deliverableTestCases below, since those are meant to actually be executed, not just read.
  content: text("content"),
  // Mermaid diagram syntax (same convention as projects.architectureDiagram) — populated for
  // DESIGN deliverables so the key components and how they interact can be shown as an actual
  // picture, not just described in prose. Nullable/unused for every other type.
  diagram: text("diagram"),
  status: deliverableStatusEnum("status").notNull().default("DRAFT"),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdBy: text("created_by"),

  // Stamped server-side only when status transitions to APPROVED, never client-supplied.
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),

  // A signed-off copy (e.g. a stakeholder sign-off sheet) attached back onto this deliverable —
  // see the matching comment on sows.signedDocumentData for why this is inline base64 rather
  // than external object storage.
  signedDocumentFilename: text("signed_document_filename"),
  signedDocumentData: text("signed_document_data"),
  signedDocumentUploadedAt: timestamp("signed_document_uploaded_at"),
  signedDocumentUploadedBy: text("signed_document_uploaded_by"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const testCaseStatusEnum = pgEnum("test_case_status", [
  "NOT_RUN",
  "PASS",
  "FAIL",
  "BLOCKED",
]);

// One row per test case for a FUNCTIONAL_TEST_SCRIPT or UAT_SCRIPT deliverable — AI-generated
// initially, then actually executed by the team: actualResult/status/executedBy/executedAt
// get filled in as each one is run, which is the whole point of calling these "scripts"
// rather than just a document describing testing.
export const deliverableTestCases = pgTable("deliverable_test_cases", {
  id: cuid(),
  deliverableId: text("deliverable_id")
    .notNull()
    .references(() => deliverables.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull().default(0),
  scenario: text("scenario").notNull(),
  steps: text("steps"),
  expectedResult: text("expected_result"),
  actualResult: text("actual_result"),
  status: testCaseStatusEnum("status").notNull().default("NOT_RUN"),
  executedBy: text("executed_by"),
  executedAt: timestamp("executed_at"),
  notes: text("notes"),
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
