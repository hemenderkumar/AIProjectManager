import { db } from "./db";
import { projects, tasks, riskItems, statusUpdates, milestones, resources, projectResources, communicationLogs, costItems, invoices, timeEntries, brainstormEntries, solutionOptions, deliveryRoleMix, sprints, ideaReviewers, users, incidents } from "./db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { computeAutoRag, scheduleVarianceDays, budgetVariancePercent, isOverdueTask, riskScore, ProjectForHealth } from "./kpi";
import { listVisibleProjects } from "./tenancy";
import { getLatestRoadmapStatusForProjects } from "./roadmap";
import type { SessionUser } from "./auth";

// `user` scopes which projects come back — see listVisibleProjects in lib/tenancy.ts, which
// applies the same ADMIN/SUPER_USER/PROJECT visibility rule as filterProjectsForUser but as a
// SQL WHERE/lookup instead of "fetch every project, then throw most of them away in JS."
// Every user-facing caller (pages, non-cron API routes) MUST pass the current user; omitting
// it returns everything unfiltered, which is only appropriate for system/cron contexts.
//
// Perf note (#260): this used to load the ENTIRE tasks and riskItems tables into memory and
// filter them per-project in a JS loop (O(projects x tasks) just to bucket rows by
// projectId), on top of loading every organization's projects before filtering to just this
// user's. Both replaced below with two GROUP BY aggregate queries scoped to only the
// projectIds actually visible to this user -- the DB does the counting, and the app never
// sees a row it doesn't need. The overdue-task and open-high-risk *definitions* (see
// isOverdueTask/riskScore in lib/kpi.ts) are re-expressed here as SQL CASE/FILTER
// expressions rather than reused as JS functions, since they now run inside the query.
export async function getAllProjectsWithMetrics(user?: SessionUser | null) {
  const allProjects = await listVisibleProjects(user);
  if (!allProjects.length) return [];

  const projectIds = allProjects.map((p) => p.id);

  const taskAgg = await db
    .select({
      projectId: tasks.projectId,
      taskCount: sql<number>`count(*)`,
      doneTaskCount: sql<number>`count(*) filter (where ${tasks.status} = 'DONE')`,
      // Mirrors isOverdueTask(): not DONE, has a due date, and that due date is in the past.
      overdueTaskCount: sql<number>`count(*) filter (where ${tasks.status} <> 'DONE' and ${tasks.dueDate} is not null and ${tasks.dueDate} < now())`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds))
    .groupBy(tasks.projectId);

  // Mirrors riskScore()'s fixed LOW/MEDIUM/HIGH/CRITICAL -> 1/2/3/4 severity map, multiplied
  // and thresholded at >=6 -- same rule, expressed as SQL instead of a JS helper per row.
  const impactScore = sql`case ${riskItems.impact} when 'LOW' then 1 when 'MEDIUM' then 2 when 'HIGH' then 3 when 'CRITICAL' then 4 else 2 end`;
  const likelihoodScore = sql`case ${riskItems.likelihood} when 'LOW' then 1 when 'MEDIUM' then 2 when 'HIGH' then 3 when 'CRITICAL' then 4 else 2 end`;
  const riskAgg = await db
    .select({
      projectId: riskItems.projectId,
      openHighRiskCount: sql<number>`count(*) filter (where ${riskItems.status} <> 'CLOSED' and (${impactScore}) * (${likelihoodScore}) >= 6)`,
    })
    .from(riskItems)
    .where(inArray(riskItems.projectId, projectIds))
    .groupBy(riskItems.projectId);

  // Open (not RESOLVED/CLOSED) incidents at HIGH or CRITICAL severity, per project -- feeds
  // computeAutoRag the same way openHighRiskCount does, so an unresolved critical incident
  // visibly hits a project's health instead of sitting invisibly in the Ongoing Support queue.
  const incidentAgg = await db
    .select({
      projectId: incidents.projectId,
      openHighSeverityIncidentCount: sql<number>`count(*) filter (where ${incidents.status} <> 'RESOLVED' and ${incidents.status} <> 'CLOSED' and (${incidents.severity} = 'HIGH' or ${incidents.severity} = 'CRITICAL'))`,
    })
    .from(incidents)
    .where(inArray(incidents.projectId, projectIds))
    .groupBy(incidents.projectId);

  const taskByProject = new Map(taskAgg.map((r) => [r.projectId, r]));
  const riskByProject = new Map(riskAgg.map((r) => [r.projectId, r]));
  const incidentByProject = new Map(incidentAgg.map((r) => [r.projectId, r]));
  // Batched across every visible project in one query, same pattern as the task/risk
  // aggregates above -- lets the Ideation list show "last roadmap call" per row without an
  // N+1 lookup.
  const roadmapStatusByProject = await getLatestRoadmapStatusForProjects(projectIds);

  return allProjects.map((p) => {
    const t = taskByProject.get(p.id);
    const overdueTaskCount = Number(t?.overdueTaskCount ?? 0);
    const openHighRiskCount = Number(riskByProject.get(p.id)?.openHighRiskCount ?? 0);
    const openHighSeverityIncidentCount = Number(incidentByProject.get(p.id)?.openHighSeverityIncidentCount ?? 0);

    const health = computeAutoRag({
      project: p as unknown as ProjectForHealth,
      overdueTaskCount,
      openHighRiskCount,
      openHighSeverityIncidentCount,
    });

    return {
      ...p,
      autoRag: health.rag,
      autoRagReasons: health.reasons,
      scheduleVarianceDays: scheduleVarianceDays(p as unknown as ProjectForHealth),
      budgetVariancePercent: budgetVariancePercent(p as unknown as ProjectForHealth),
      overdueTaskCount,
      openHighRiskCount,
      openHighSeverityIncidentCount,
      taskCount: Number(t?.taskCount ?? 0),
      doneTaskCount: Number(t?.doneTaskCount ?? 0),
      roadmapStatus: roadmapStatusByProject.get(p.id) ?? null,
    };
  });
}

export async function getPortfolioSummary(user?: SessionUser | null) {
  const withMetrics = await getAllProjectsWithMetrics(user);
  const active = withMetrics.filter((p) => p.stage !== "CLOSED");

  const byRag = { GREEN: 0, YELLOW: 0, RED: 0 } as Record<string, number>;
  active.forEach((p) => (byRag[p.autoRag] = (byRag[p.autoRag] ?? 0) + 1));

  const byStage: Record<string, number> = {};
  withMetrics.forEach((p) => (byStage[p.stage] = (byStage[p.stage] ?? 0) + 1));

  const totalBudgetPlanned = active.reduce((s, p) => s + (p.budgetPlanned ?? 0), 0);
  const totalBudgetActual = active.reduce((s, p) => s + (p.budgetActual ?? 0), 0);
  const avgPercentComplete =
    active.length === 0
      ? 0
      : Math.round(active.reduce((s, p) => s + p.percentComplete, 0) / active.length);
  const totalOverdueTasks = active.reduce((s, p) => s + p.overdueTaskCount, 0);
  const totalOpenHighRisks = active.reduce((s, p) => s + p.openHighRiskCount, 0);

  return {
    projects: withMetrics,
    activeCount: active.length,
    byRag,
    byStage,
    totalBudgetPlanned,
    totalBudgetActual,
    avgPercentComplete,
    totalOverdueTasks,
    totalOpenHighRisks,
  };
}

export async function getProjectDetail(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;

  const [projectTasks, projectRisks, updates, comms, projectMilestones, allocations, projectCostItems, projectInvoices, projectBrainstormEntries, projectSolutionOptions, projectDeliveryRoleMix, projectSprints, projectIdeaReviewers, projectIncidents] =
    await Promise.all([
      db.select().from(tasks).where(eq(tasks.projectId, id)),
      db.select().from(riskItems).where(eq(riskItems.projectId, id)),
      db.select().from(statusUpdates).where(eq(statusUpdates.projectId, id)),
      db.select().from(communicationLogs).where(eq(communicationLogs.projectId, id)),
      db.select().from(milestones).where(eq(milestones.projectId, id)),
      db
        .select({
          id: projectResources.id,
          allocationPercent: projectResources.allocationPercent,
          resourceId: resources.id,
          name: resources.name,
          role: resources.role,
          email: resources.email,
          capacityHoursPerWk: resources.capacityHoursPerWk,
          costPerHour: resources.costPerHour,
        })
        .from(projectResources)
        .innerJoin(resources, eq(projectResources.resourceId, resources.id))
        .where(eq(projectResources.projectId, id)),
      db.select().from(costItems).where(eq(costItems.projectId, id)),
      db.select().from(invoices).where(eq(invoices.projectId, id)),
      db.select().from(brainstormEntries).where(eq(brainstormEntries.projectId, id)),
      db.select().from(solutionOptions).where(eq(solutionOptions.projectId, id)),
      db.select().from(deliveryRoleMix).where(eq(deliveryRoleMix.projectId, id)),
      db.select().from(sprints).where(eq(sprints.projectId, id)),
      db
        .select({
          id: ideaReviewers.id,
          userId: ideaReviewers.userId,
          name: users.name,
          email: users.email,
          invitedBy: ideaReviewers.invitedBy,
          invitedAt: ideaReviewers.invitedAt,
          decision: ideaReviewers.decision,
          comment: ideaReviewers.comment,
          respondedAt: ideaReviewers.respondedAt,
        })
        .from(ideaReviewers)
        .innerJoin(users, eq(ideaReviewers.userId, users.id))
        .where(eq(ideaReviewers.projectId, id)),
      db.select().from(incidents).where(eq(incidents.projectId, id)),
    ]);

  const taskIds = projectTasks.map((t) => t.id);
  const projectTimeEntries = taskIds.length
    ? await db.select().from(timeEntries).where(inArray(timeEntries.taskId, taskIds))
    : [];

  const overdueTaskCount = projectTasks.filter((t) => isOverdueTask(t)).length;
  const openHighRiskCount = projectRisks.filter(
    (r) => r.status !== "CLOSED" && riskScore(r) >= 6
  ).length;
  const openHighSeverityIncidentCount = projectIncidents.filter(
    (i) => i.status !== "RESOLVED" && i.status !== "CLOSED" && (i.severity === "HIGH" || i.severity === "CRITICAL")
  ).length;

  const health = computeAutoRag({
    project: project as unknown as ProjectForHealth,
    overdueTaskCount,
    openHighRiskCount,
    openHighSeverityIncidentCount,
  });

  const roadmapStatusMap = await getLatestRoadmapStatusForProjects([id]);

  return {
    project,
    autoRag: health.rag,
    autoRagReasons: health.reasons,
    scheduleVarianceDays: scheduleVarianceDays(project as unknown as ProjectForHealth),
    budgetVariancePercent: budgetVariancePercent(project as unknown as ProjectForHealth),
    openHighSeverityIncidentCount,
    tasks: projectTasks,
    risks: projectRisks,
    incidents: projectIncidents.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime()),
    statusUpdates: updates.sort((a, b) => b.date.getTime() - a.date.getTime()),
    communications: comms.sort((a, b) => b.date.getTime() - a.date.getTime()),
    milestones: projectMilestones,
    resources: allocations,
    costItems: projectCostItems,
    invoices: projectInvoices.sort((a, b) => (b.invoiceDate?.getTime() ?? 0) - (a.invoiceDate?.getTime() ?? 0)),
    timeEntries: projectTimeEntries.sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime()),
    brainstormEntries: projectBrainstormEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    solutionOptions: projectSolutionOptions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    deliveryRoleMix: projectDeliveryRoleMix,
    sprints: projectSprints.sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0)),
    ideaReviewers: projectIdeaReviewers.sort((a, b) => a.invitedAt.getTime() - b.invitedAt.getTime()),
    // Last roadmap classification for this project, if it's ever been included in one -- lets
    // the Overview tab show "last roadmap call: MEDIUM impact / quick win" without a separate
    // fetch to the Roadmap page.
    roadmapStatus: roadmapStatusMap.get(id) ?? null,
  };
}

export function formatPortfolioForAI(summary: Awaited<ReturnType<typeof getPortfolioSummary>>) {
  const lines = summary.projects.map((p) => {
    return `- ${p.name} [stage: ${p.stage}, rag: ${p.autoRag}, priority: ${p.priority}, % complete: ${p.percentComplete}%, budget planned/actual: $${p.budgetPlanned}/$${p.budgetActual}, overdue tasks: ${p.overdueTaskCount}, open high risks: ${p.openHighRiskCount}, open high-severity incidents: ${p.openHighSeverityIncidentCount}, PM: ${p.projectManager ?? "n/a"}, sponsor: ${p.sponsor ?? "n/a"}] reasons: ${p.autoRagReasons.join("; ")}`;
  });
  return `Portfolio overview (${summary.projects.length} projects, ${summary.activeCount} active):
RAG breakdown: ${summary.byRag.GREEN ?? 0} Green / ${summary.byRag.YELLOW ?? 0} Yellow / ${summary.byRag.RED ?? 0} Red
Avg % complete (active): ${summary.avgPercentComplete}%
Total planned budget (active): $${summary.totalBudgetPlanned.toLocaleString()}
Total actual spend (active): $${summary.totalBudgetActual.toLocaleString()}
Total overdue tasks: ${summary.totalOverdueTasks}
Total open high-severity risks: ${summary.totalOpenHighRisks}

Projects:
${lines.join("\n")}`;
}
