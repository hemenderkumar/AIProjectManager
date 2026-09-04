import { db } from "./db";
import { incidents, incidentUpdates, projects, tasks } from "./db/schema";
import { eq, inArray, isNull, or, desc } from "drizzle-orm";
import { canAccessProject, canAccessOptionalProject, isInternalStaff, listVisibleProjects } from "./tenancy";
import { dispatchWebhook } from "./webhooks";
import type { SessionUser } from "./auth";

// SLA targets are intentionally fixed per severity (see lib/incidentSla.ts) rather than
// per-org configurable in this v1 -- that's a reasonable follow-up once a specific org asks
// for it, but adding an admin-configurable SLA catalog before anyone's asked for one is
// exactly the kind of unused-knob complexity this app tries to avoid elsewhere.

// SQL-scoped equivalent of "fetch every incident, then filter in JS per row" (which is what
// both /api/incidents and support/page.tsx used to do -- same class of bug #260 fixed for
// projects/tasks: it pulls every organization's incidents into memory just to throw most of
// them away). Visibility rule is unchanged from canAccessOptionalProject: a linked incident
// follows its project's own access rule (ADMIN: all; SUPER_USER: own org; PM/CONTRIBUTOR/
// VIEWER: only projects they're a member of); an unlinked incident (no project) is
// internal-staff-only.
export async function listIncidents(user: SessionUser) {
  if (user.role === "ADMIN") {
    return db.select().from(incidents).orderBy(desc(incidents.reportedAt));
  }

  const visibleProjects = await listVisibleProjects(user);
  const visibleProjectIds = visibleProjects.map((p) => p.id);

  const conditions = [];
  if (visibleProjectIds.length) conditions.push(inArray(incidents.projectId, visibleProjectIds));
  if (isInternalStaff(user)) conditions.push(isNull(incidents.projectId));
  if (conditions.length === 0) return [];

  return db
    .select()
    .from(incidents)
    .where(or(...conditions))
    .orderBy(desc(incidents.reportedAt));
}

// An incident's "organization" for webhook routing purposes is whatever org its linked
// project belongs to (null = internal/unlinked, matching the webhook org-null = shared/
// internal subscription convention already used for TASK_STATUS_CHANGED etc.).
async function incidentOrgId(incident: { projectId: string | null }): Promise<string | null> {
  if (!incident.projectId) return null;
  const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, incident.projectId));
  return project?.organizationId ?? null;
}

export type CreateIncidentInput = {
  projectId?: string | null;
  title: string;
  description?: string | null;
  severity?: string;
  status?: string;
  reportedBy?: string | null;
  assignee?: string | null;
  reportedByUserId?: string | null;
  assigneeUserId?: string | null;
  reportedAt?: string | null;
};

export async function createIncident(user: SessionUser, data: CreateIncidentInput) {
  const projectId = data.projectId || null;
  if (!(await canAccessOptionalProject(user, projectId))) return { error: "forbidden" as const };

  const severity = data.severity || "MEDIUM";
  const [created] = await db
    .insert(incidents)
    .values({
      projectId,
      title: data.title,
      description: data.description || null,
      severity: severity as (typeof incidents.$inferInsert)["severity"],
      status: (data.status || "OPEN") as (typeof incidents.$inferInsert)["status"],
      reportedBy: data.reportedBy || null,
      assignee: data.assignee || null,
      reportedByUserId: data.reportedByUserId || null,
      assigneeUserId: data.assigneeUserId || null,
      reportedAt: data.reportedAt ? new Date(data.reportedAt) : new Date(),
      escalatedAt: severity === "CRITICAL" ? new Date() : null,
    })
    .returning();

  const orgId = await incidentOrgId(created);
  await dispatchWebhook(orgId, "INCIDENT_CREATED", {
    id: created.id,
    title: created.title,
    severity: created.severity,
    status: created.status,
    projectId: created.projectId,
  });

  return { incident: created };
}

const PATCH_ALLOWED_FIELDS = [
  "projectId", "title", "description", "severity", "status",
  "reportedBy", "assignee", "reportedByUserId", "assigneeUserId",
  "reportedAt", "acknowledgedAt", "resolvedAt", "resolutionNotes", "aiRecommendation",
] as const;
const PATCH_DATE_FIELDS = new Set(["reportedAt", "acknowledgedAt", "resolvedAt"]);

export async function patchIncident(user: SessionUser, id: string, body: Record<string, unknown>) {
  const [existing] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!existing) return { error: "not_found" as const };
  if (!(await canAccessOptionalProject(user, existing.projectId))) return { error: "forbidden" as const };

  const update: Record<string, unknown> = {};
  for (const key of PATCH_ALLOWED_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];
    if (PATCH_DATE_FIELDS.has(key)) {
      update[key] = v ? new Date(v as string) : null;
    } else {
      update[key] = v === "" ? null : v;
    }
  }

  // Auto-stamp acknowledgedAt the first time status moves to IN_PROGRESS, mirroring the
  // existing resolvedAt auto-stamp below -- lets time-to-acknowledge be measured without
  // anyone remembering to set it by hand.
  if (body.status === "IN_PROGRESS" && !existing.acknowledgedAt && !("acknowledgedAt" in body)) {
    update.acknowledgedAt = new Date();
  }
  // Auto-stamp resolvedAt moving into RESOLVED/CLOSED, if the caller didn't set one.
  if ((body.status === "RESOLVED" || body.status === "CLOSED") && !("resolvedAt" in body)) {
    update.resolvedAt = new Date();
  }

  const nextSeverity = (update.severity as string | undefined) ?? existing.severity;
  const escalating = nextSeverity === "CRITICAL" && existing.severity !== "CRITICAL" && !existing.escalatedAt;
  if (escalating) update.escalatedAt = new Date();

  const [updated] = await db.update(incidents).set(update).where(eq(incidents.id, id)).returning();
  if (!updated) return { error: "not_found" as const };

  const orgId = await incidentOrgId(updated);
  if ("status" in body && body.status !== existing.status) {
    await dispatchWebhook(orgId, "INCIDENT_STATUS_CHANGED", {
      id: updated.id, title: updated.title, previousStatus: existing.status, status: updated.status, projectId: updated.projectId,
    });
  }
  if (escalating) {
    await dispatchWebhook(orgId, "INCIDENT_ESCALATED", {
      id: updated.id, title: updated.title, severity: updated.severity, projectId: updated.projectId,
    });
  }

  return { incident: updated };
}

export async function listIncidentUpdates(user: SessionUser, incidentId: string) {
  const [existing] = await db.select({ projectId: incidents.projectId }).from(incidents).where(eq(incidents.id, incidentId));
  if (!existing) return { error: "not_found" as const };
  if (!(await canAccessOptionalProject(user, existing.projectId))) return { error: "forbidden" as const };
  const rows = await db.select().from(incidentUpdates).where(eq(incidentUpdates.incidentId, incidentId)).orderBy(incidentUpdates.createdAt);
  return { updates: rows };
}

export async function addIncidentUpdate(user: SessionUser, incidentId: string, bodyText: string) {
  const [existing] = await db.select({ projectId: incidents.projectId }).from(incidents).where(eq(incidents.id, incidentId));
  if (!existing) return { error: "not_found" as const };
  if (!(await canAccessOptionalProject(user, existing.projectId))) return { error: "forbidden" as const };
  const trimmed = bodyText.trim();
  if (!trimmed) return { error: "empty" as const };

  const [created] = await db
    .insert(incidentUpdates)
    .values({ incidentId, authorId: user.id, authorName: user.name, body: trimmed })
    .returning();
  return { update: created };
}

// Spins a resolved (or any) incident's follow-up work off into a real, trackable task in its
// linked project -- addresses the "postmortem action items just get lost in a text field"
// gap. Only possible when the incident IS linked to a project (there's nowhere else to put
// the task), and only once per incident (re-running just returns the existing link).
export async function createFollowUpTask(user: SessionUser, incidentId: string, overrides?: { title?: string; description?: string }) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  if (!incident) return { error: "not_found" as const };
  if (!incident.projectId) return { error: "no_project" as const };
  if (!(await canAccessProject(user, incident.projectId))) return { error: "forbidden" as const };
  if (incident.followUpTaskId) return { error: "already_linked" as const, followUpTaskId: incident.followUpTaskId };

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: incident.projectId,
      title: overrides?.title?.trim() || `Follow-up: ${incident.title}`,
      description: overrides?.description?.trim() || incident.resolutionNotes || incident.description || null,
      // Incident severity and task priority share the same enum (LOW/MEDIUM/HIGH/CRITICAL),
      // so a CRITICAL incident's follow-up starts life as a CRITICAL task, not MEDIUM-default.
      priority: incident.severity,
    })
    .returning();

  await db.update(incidents).set({ followUpTaskId: task.id }).where(eq(incidents.id, incidentId));
  return { task };
}
