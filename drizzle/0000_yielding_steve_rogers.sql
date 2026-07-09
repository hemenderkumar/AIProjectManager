CREATE TYPE "public"."comm_type" AS ENUM('MEETING', 'EMAIL', 'SLACK', 'CALL', 'WORKSHOP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('INCEPTION', 'IDEATION', 'CHARTER', 'EXECUTION', 'CLOSING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."rag_status" AS ENUM('GREEN', 'YELLOW', 'RED');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');--> statement-breakpoint
CREATE TABLE "communication_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"type" "comm_type" DEFAULT 'MEETING' NOT NULL,
	"summary" text,
	"participants" text,
	"action_items" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" timestamp,
	"completed_at" timestamp,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"allocation_percent" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sponsor" text,
	"project_manager" text,
	"stage" "project_stage" DEFAULT 'INCEPTION' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"rag_status" "rag_status" DEFAULT 'GREEN' NOT NULL,
	"start_date" timestamp,
	"target_end_date" timestamp,
	"actual_end_date" timestamp,
	"budget_planned" real DEFAULT 0,
	"budget_actual" real DEFAULT 0,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"problem_statement" text,
	"proposed_solution" text,
	"expected_benefits" text,
	"ideation_notes" text,
	"business_case" text,
	"objectives" text,
	"scope_in_scope" text,
	"scope_out_of_scope" text,
	"deliverables" text,
	"success_criteria" text,
	"stakeholders" text,
	"assumptions_risks" text,
	"charter_approved_by" text,
	"charter_approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"capacity_hours_per_wk" real DEFAULT 40,
	"cost_per_hour" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"description" text NOT NULL,
	"impact" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"likelihood" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"mitigation" text,
	"owner" text,
	"status" "risk_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"rag_status" "rag_status" DEFAULT 'GREEN' NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"accomplishments" text,
	"upcoming" text,
	"blockers" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"assignee_id" text,
	"start_date" timestamp,
	"due_date" timestamp,
	"completed_at" timestamp,
	"estimate_hours" real DEFAULT 0,
	"actual_hours" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_resources_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_resource_uq" ON "project_resources" USING btree ("project_id","resource_id");