import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  pgEnum,
  uniqueIndex,
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

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
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

const cuid = () => text("id").primaryKey().$defaultFn(() => createId());

export const projects = pgTable("projects", {
  id: cuid(),
  name: text("name").notNull(),
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

  // Charter
  businessCase: text("business_case"),
  objectives: text("objectives"),
  scopeInScope: text("scope_in_scope"),
  scopeOutOfScope: text("scope_out_of_scope"),
  deliverables: text("deliverables"),
  successCriteria: text("success_criteria"),
  stakeholders: text("stakeholders"),
  assumptionsRisks: text("assumptions_risks"),
  charterApprovedBy: text("charter_approved_by"),
  charterApprovedAt: timestamp("charter_approved_at"),
});

export const resources = pgTable("resources", {
  id: cuid(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  capacityHoursPerWk: real("capacity_hours_per_wk").default(40),
  costPerHour: real("cost_per_hour").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  isAgentTask: boolean("is_agent_task").notNull().default(false),
  createdByAi: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

export const users = pgTable("users", {
  id: cuid(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("VIEWER"),
  resourceId: text("resource_id").references(() => resources.id),
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

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  weeklyReportCadence: reportCadenceEnum("weekly_report_cadence").notNull().default("WEEKLY"),
  steeringCadence: reportCadenceEnum("steering_cadence").notNull().default("MONTHLY"),
  avatarVoiceGender: text("avatar_voice_gender").notNull().default("female"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
  resources: many(projectResources),
  statusUpdates: many(statusUpdates),
  communications: many(communicationLogs),
  risks: many(riskItems),
  milestones: many(milestones),
}));

export const resourcesRelations = relations(resources, ({ many }) => ({
  projects: many(projectResources),
  tasks: many(tasks),
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

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(resources, {
    fields: [tasks.assigneeId],
    references: [resources.id],
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
