import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  organizations,
  users,
  projects,
  tasks,
  milestones,
  statusUpdates,
  communicationLogs,
  riskItems,
  costItems,
  invoices,
  incidents,
  brainstormEntries,
  solutionOptions,
  deliveryRoleMix,
  sprints,
  timeEntries,
} from "./db/schema";

/** Builds a full JSON export of everything tied to one organization: its users, its
 * projects, and every child record of those projects. Used by both the SUPER_USER
 * self-service export and the ADMIN organization export — same shape either way, so a
 * client that downloads their own data sees exactly what an admin would see about them. */
export async function buildOrganizationExport(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return null;

  const orgUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, organizationId));

  const orgProjects = await db.select().from(projects).where(eq(projects.organizationId, organizationId));
  const projectIds = orgProjects.map((p) => p.id);

  const [
    taskRows,
    milestoneRows,
    statusUpdateRows,
    communicationRows,
    riskRows,
    costItemRows,
    invoiceRows,
    incidentRows,
    brainstormRows,
    solutionOptionRows,
    deliveryRoleMixRows,
    sprintRows,
  ] = projectIds.length === 0
    ? [[], [], [], [], [], [], [], [], [], [], [], []]
    : await Promise.all([
        db.select().from(tasks).where(inArray(tasks.projectId, projectIds)),
        db.select().from(milestones).where(inArray(milestones.projectId, projectIds)),
        db.select().from(statusUpdates).where(inArray(statusUpdates.projectId, projectIds)),
        db.select().from(communicationLogs).where(inArray(communicationLogs.projectId, projectIds)),
        db.select().from(riskItems).where(inArray(riskItems.projectId, projectIds)),
        db.select().from(costItems).where(inArray(costItems.projectId, projectIds)),
        db.select().from(invoices).where(inArray(invoices.projectId, projectIds)),
        db.select().from(incidents).where(inArray(incidents.projectId, projectIds)),
        db.select().from(brainstormEntries).where(inArray(brainstormEntries.projectId, projectIds)),
        db.select().from(solutionOptions).where(inArray(solutionOptions.projectId, projectIds)),
        db.select().from(deliveryRoleMix).where(inArray(deliveryRoleMix.projectId, projectIds)),
        db.select().from(sprints).where(inArray(sprints.projectId, projectIds)),
      ]);

  const taskIds = taskRows.map((t) => t.id);
  const timeEntryRows = taskIds.length === 0 ? [] : await db.select().from(timeEntries).where(inArray(timeEntries.taskId, taskIds));

  return {
    exportedAt: new Date().toISOString(),
    organization: { id: org.id, name: org.name, createdAt: org.createdAt },
    users: orgUsers,
    projects: orgProjects.map((p) => ({
      ...p,
      tasks: taskRows.filter((t) => t.projectId === p.id),
      milestones: milestoneRows.filter((m) => m.projectId === p.id),
      statusUpdates: statusUpdateRows.filter((s) => s.projectId === p.id),
      communications: communicationRows.filter((c) => c.projectId === p.id),
      risks: riskRows.filter((r) => r.projectId === p.id),
      costItems: costItemRows.filter((c) => c.projectId === p.id),
      invoices: invoiceRows.filter((i) => i.projectId === p.id),
      incidents: incidentRows.filter((i) => i.projectId === p.id),
      brainstormEntries: brainstormRows.filter((b) => b.projectId === p.id),
      solutionOptions: solutionOptionRows.filter((s) => s.projectId === p.id),
      deliveryRoleMix: deliveryRoleMixRows.filter((d) => d.projectId === p.id),
      sprints: sprintRows.filter((s) => s.projectId === p.id),
      timeEntries: timeEntryRows.filter((te) => taskRows.some((t) => t.id === te.taskId && t.projectId === p.id)),
    })),
  };
}

/** Permanently deletes everything tied to one organization: all its projects (which
 * cascade-deletes every child record via FK constraints), all its users, then the
 * organization row itself. Irreversible — only call after explicit ADMIN confirmation. */
export async function deleteOrganizationData(organizationId: string) {
  const orgProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
  const projectIds = orgProjects.map((p) => p.id);

  if (projectIds.length > 0) {
    await db.delete(projects).where(inArray(projects.id, projectIds));
  }
  await db.delete(users).where(eq(users.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));

  return { deletedProjectCount: projectIds.length };
}
