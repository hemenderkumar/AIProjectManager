import { eq } from "drizzle-orm";
import { db } from "./db";
import { sows, deliverables, riskItems, tasks, solutionOptions, projects, scOrganizations, scProjects } from "./db/schema";
import type { SessionUser } from "./auth";
import type { ScRole } from "./keelconnect/access";

export type EntityType = "sow" | "deliverable" | "risk" | "task" | "solutionOption" | "project" | "scOrganization" | "scProject";

export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "enum";
  options?: string[];
};

// One config per entity type this "edit via AI chat" feature covers. `apply` always goes
// through that entity's OWN existing PATCH route (never writes to the DB directly from here),
// so every side effect and permission check that route already has (audit logging, the
// signedAt/completedAt auto-stamps, the single-selected-option invariant, etc.) still applies
// exactly as if the user had edited the field by hand — this endpoint only PROPOSES which
// fields should change, grounded to a fixed whitelist per type.
//
// Two entirely separate access-control systems share this one registry: Keel Deliver's
// per-project role check (requireProjectAccess + minRole) and KeelConnect's per-org role
// check (requireScOrgRole + scRoles). `system` picks which one /api/ai/edit-entity uses;
// entries that omit it default to "deliver" (every entry that predates KeelConnect support).
export const ENTITY_CONFIG: Record<
  EntityType,
  {
    label: string;
    system?: "deliver" | "keelconnect";
    minRole?: SessionUser["role"];
    scRoles?: ScRole[];
    fields: FieldDef[];
    load: (entityId: string) => Promise<{ row: Record<string, unknown>; projectId?: string; scOrganizationId?: string } | null>;
    patchUrl: (entityId: string, projectId?: string) => string;
  }
> = {
  sow: {
    label: "Statement of Work",
    minRole: "SUPER_USER",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "vendorName", label: "Vendor name", kind: "text" },
      { key: "vendorContactName", label: "Vendor contact name", kind: "text" },
      { key: "vendorContactEmail", label: "Vendor contact email", kind: "text" },
      { key: "scope", label: "Scope", kind: "text" },
      { key: "deliverablesSummary", label: "Deliverables summary", kind: "text" },
      { key: "timeline", label: "Timeline", kind: "text" },
      { key: "fundingAmount", label: "Funding amount", kind: "number" },
      { key: "fundingTerms", label: "Funding terms", kind: "text" },
      { key: "risks", label: "Risks", kind: "text" },
      { key: "issues", label: "Issues", kind: "text" },
      { key: "content", label: "Full document", kind: "text" },
      { key: "status", label: "Status", kind: "enum", options: ["DRAFT", "APPROVED", "PENDING_SIGNATURE", "SIGNED", "ACTIVE", "COMPLETED", "TERMINATED"] },
    ],
    load: async (id) => {
      const [row] = await db.select().from(sows).where(eq(sows.id, id));
      return row ? { row, projectId: row.projectId } : null;
    },
    patchUrl: (id) => `/api/sows/${id}`,
  },

  deliverable: {
    label: "Deliverable",
    minRole: "CONTRIBUTOR",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "content", label: "Content", kind: "text" },
      { key: "status", label: "Status", kind: "enum", options: ["DRAFT", "IN_REVIEW", "APPROVED", "FINAL"] },
    ],
    load: async (id) => {
      const [row] = await db.select().from(deliverables).where(eq(deliverables.id, id));
      return row ? { row, projectId: row.projectId } : null;
    },
    patchUrl: (id) => `/api/deliverables/${id}`,
  },

  risk: {
    label: "Risk",
    minRole: "CONTRIBUTOR",
    fields: [
      { key: "description", label: "Description", kind: "text" },
      { key: "impact", label: "Impact", kind: "enum", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "likelihood", label: "Likelihood", kind: "enum", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "mitigation", label: "Mitigation", kind: "text" },
      { key: "owner", label: "Owner", kind: "text" },
      { key: "status", label: "Status", kind: "enum", options: ["OPEN", "MITIGATING", "CLOSED", "ACCEPTED"] },
    ],
    load: async (id) => {
      const [row] = await db.select().from(riskItems).where(eq(riskItems.id, id));
      return row ? { row, projectId: row.projectId } : null;
    },
    patchUrl: (id, projectId) => `/api/projects/${projectId}/risks/${id}`,
  },

  task: {
    label: "Task",
    minRole: "CONTRIBUTOR",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
      { key: "priority", label: "Priority", kind: "enum", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "status", label: "Status", kind: "enum", options: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] },
      { key: "estimateHours", label: "Estimate (hours)", kind: "number" },
      { key: "phase", label: "SDLC phase", kind: "text" },
    ],
    load: async (id) => {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
      return row ? { row, projectId: row.projectId } : null;
    },
    patchUrl: (id, projectId) => `/api/projects/${projectId}/tasks/${id}`,
  },

  solutionOption: {
    label: "Solution Option",
    minRole: "CONTRIBUTOR",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
      { key: "pros", label: "Pros", kind: "text" },
      { key: "cons", label: "Cons", kind: "text" },
      { key: "feasibilityNotes", label: "Feasibility notes", kind: "text" },
      { key: "isSelected", label: "Selected as the chosen option", kind: "boolean" },
    ],
    load: async (id) => {
      const [row] = await db.select().from(solutionOptions).where(eq(solutionOptions.id, id));
      return row ? { row, projectId: row.projectId } : null;
    },
    patchUrl: (id, projectId) => `/api/projects/${projectId}/solution-options/${id}`,
  },

  project: {
    label: "Project Charter",
    minRole: "CONTRIBUTOR",
    fields: [
      { key: "description", label: "Description", kind: "text" },
      { key: "problemStatement", label: "Problem statement", kind: "text" },
      { key: "proposedSolution", label: "Proposed solution", kind: "text" },
      { key: "expectedBenefits", label: "Expected benefits", kind: "text" },
      { key: "ideationNotes", label: "Ideation notes", kind: "text" },
      { key: "businessCase", label: "Business case", kind: "text" },
      { key: "objectives", label: "Objectives", kind: "text" },
      { key: "scopeInScope", label: "Scope (in)", kind: "text" },
      { key: "scopeOutOfScope", label: "Scope (out)", kind: "text" },
      { key: "deliverables", label: "Deliverables (charter summary)", kind: "text" },
      { key: "successCriteria", label: "Success criteria", kind: "text" },
      { key: "risks", label: "Risks (charter summary)", kind: "text" },
      { key: "highLevelRequirements", label: "High-level requirements", kind: "text" },
      { key: "highLevelArchitecture", label: "High-level architecture", kind: "text" },
      { key: "recommendedTechnology", label: "Recommended technology", kind: "text" },
    ],
    load: async (id) => {
      const [row] = await db.select().from(projects).where(eq(projects.id, id));
      return row ? { row, projectId: row.id } : null;
    },
    patchUrl: (id) => `/api/projects/${id}`,
  },

  scOrganization: {
    label: "KeelConnect Organization",
    system: "keelconnect",
    scRoles: ["CLIENT_ORG_ADMIN", "VENDOR_ORG_ADMIN"],
    fields: [
      { key: "name", label: "Company name", kind: "text" },
      { key: "companyProfile", label: "Company profile", kind: "text" },
      { key: "taxId", label: "Tax ID", kind: "text" },
      { key: "primaryCountry", label: "Primary country", kind: "text" },
      // verificationStatus deliberately excluded -- only a Platform Admin/Compliance
      // Officer can set that (see /api/keelconnect/organizations/[orgId] PATCH), so an org
      // can't use this chat to self-declare "VERIFIED".
    ],
    load: async (id) => {
      const [row] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, id));
      return row ? { row, scOrganizationId: row.id } : null;
    },
    patchUrl: (id) => `/api/keelconnect/organizations/${id}`,
  },

  scProject: {
    label: "KeelConnect Project Posting",
    system: "keelconnect",
    scRoles: ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER"],
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "targetBudget", label: "Target budget", kind: "number" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "engagementModel", label: "Engagement model", kind: "enum", options: ["MARKETPLACE", "MEDIATOR"] },
      { key: "locationRequirement", label: "Location requirement", kind: "enum", options: ["GLOBAL", "RESTRICTED"] },
      // status deliberately excluded -- posting/cancelling a project has its own dedicated
      // action with transition validation (see PATCH route), not a free-text AI edit.
    ],
    load: async (id) => {
      const [row] = await db.select().from(scProjects).where(eq(scProjects.id, id));
      return row ? { row, scOrganizationId: row.clientOrgId } : null;
    },
    patchUrl: (id) => `/api/keelconnect/projects/${id}`,
  },
};

export function describeSnapshot(fields: FieldDef[], row: Record<string, unknown>): string {
  return fields
    .map((f) => {
      const value = row[f.key];
      const optionsNote = f.kind === "enum" && f.options ? ` [one of: ${f.options.join(", ")}]` : "";
      return `- ${f.label} (${f.key})${optionsNote}: ${value == null || value === "" ? "(empty)" : String(value)}`;
    })
    .join("\n");
}
