import { db } from "./db";
import { projects, tasks, riskItems, statusUpdates, milestones, resources, projectResources, communicationLogs } from "./db/schema";
import { eq } from "drizzle-orm";
import { computeAutoRag, scheduleVarianceDays, budgetVariancePercent, isOverdueTask, riskScore, ProjectForHealth } from "./kpi";

export async function getAllProjectsWithMetrics() {
  const allProjects = await db.select().from(projects);
  const allTasks = await db.select().from(tasks);
  const allRisks = await db.select().from(riskItems);

  return allProjects.map((p) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const pRisks = allRisks.filter((r) => r.projectId === p.id);
    const overdueTaskCount = pTasks.filter((t) => isOverdueTask(t)).length;
    const openHighRiskCount = pRisks.filter(
      (r) => r.status !== "CLOSED" && riskScore(r) >= 6
    ).length;

    const health = computeAutoRag({
      project: p as unknown as ProjectForHealth,
      overdueTaskCount,
      openHighRiskCount,
    });

    return {
      ...p,
      autoRag: health.rag,
      autoRagReasons: health.reasons,
      scheduleVarianceDays: scheduleVarianceDays(p as unknown as ProjectForHealth),
      budgetVariancePercent: budgetVariancePercent(p as unknown as ProjectForHealth),
      overdueTaskCount,
      openHighRiskCount,
      taskCount: pTasks.length,
      doneTaskCount: pTasks.filter((t) => t.status === "DONE").length,
    };
  });
}

export async function getPortfolioSummary() {
  const withMetrics = await getAllProjectsWithMetrics();
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

  const [projectTasks, projectRisks, updates, comms, projectMilestones, allocations] =
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
    ]);

  const overdueTaskCount = projectTasks.filter((t) => isOverdueTask(t)).length;
  const openHighRiskCount = projectRisks.filter(
    (r) => r.status !== "CLOSED" && riskScore(r) >= 6
  ).length;

  const health = computeAutoRag({
    project: project as unknown as ProjectForHealth,
    overdueTaskCount,
    openHighRiskCount,
  });

  return {
    project,
    autoRag: health.rag,
    autoRagReasons: health.reasons,
    scheduleVarianceDays: scheduleVarianceDays(project as unknown as ProjectForHealth),
    budgetVariancePercent: budgetVariancePercent(project as unknown as ProjectForHealth),
    tasks: projectTasks,
    risks: projectRisks,
    statusUpdates: updates.sort((a, b) => b.date.getTime() - a.date.getTime()),
    communications: comms.sort((a, b) => b.date.getTime() - a.date.getTime()),
    milestones: projectMilestones,
    resources: allocations,
  };
}

export function formatPortfolioForAI(summary: Awaited<ReturnType<typeof getPortfolioSummary>>) {
  const lines = summary.projects.map((p) => {
    return `- ${p.name} [stage: ${p.stage}, rag: ${p.autoRag}, priority: ${p.priority}, % complete: ${p.percentComplete}%, budget planned/actual: $${p.budgetPlanned}/$${p.budgetActual}, overdue tasks: ${p.overdueTaskCount}, open high risks: ${p.openHighRiskCount}, PM: ${p.projectManager ?? "n/a"}, sponsor: ${p.sponsor ?? "n/a"}] reasons: ${p.autoRagReasons.join("; ")}`;
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
