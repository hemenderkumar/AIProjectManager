import { db } from "./db";
import { projectResources, resources, satisfactionSurveys } from "./db/schema";
import { eq, inArray, and, gte } from "drizzle-orm";
import { listVisibleProjects } from "./tenancy";
import { budgetVariancePercent, type ProjectForHealth } from "./kpi";
import type { SessionUser } from "./auth";

// The "on budget" threshold below deliberately reuses computeAutoRag's own <10% variance
// cutoff (see lib/kpi.ts) rather than inventing a second definition of "on budget" -- a
// project this scorecard calls on-budget is, by construction, one that never crossed into
// even the YELLOW budget-variance band while it was open.
const ON_BUDGET_VARIANCE_THRESHOLD = 10;

export type CsatMonthBucket = {
  monthKey: string; // "YYYY-MM"
  avgCsat: number | null;
  avgNps: number | null;
  responseCount: number;
};

export type ResourceUtilizationRow = {
  resourceId: string;
  name: string;
  role: string | null;
  capacityHoursPerWk: number | null;
  allocatedPercent: number;
};

export type PmoScorecardResult = {
  totalProjects: number;
  activeProjects: number;
  closedProjects: number;

  // Each rate is null (not 0) when there isn't enough closed-project data to judge it yet --
  // a brand-new org with no closed projects shouldn't see a scary 0% success rate.
  onTimeRate: number | null;
  onTimeSampleSize: number;
  onBudgetRate: number | null;
  onBudgetSampleSize: number;
  successRate: number | null; // on-time AND on-budget, among projects eligible for both
  successSampleSize: number;
  avgBudgetVariancePercent: number | null;

  resourceUtilization: ResourceUtilizationRow[];
  avgResourceUtilizationPercent: number | null;
  overAllocatedCount: number;

  csatTrend: CsatMonthBucket[]; // oldest -> newest, last 6 calendar months
  overallAvgCsat: number | null;
  overallAvgNps: number | null;
  csatResponseCount: number;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

// Org-wide PMO rollup across every project visible to `user` (same visibility rule as the
// rest of the portfolio -- see listVisibleProjects). Reuses the health/forecast primitives
// already built for the dashboard and forecast rollup (#398) rather than recomputing
// project-level math a third way.
export async function computePmoScorecard(user?: SessionUser | null): Promise<PmoScorecardResult> {
  const visible = await listVisibleProjects(user);
  const projectIds = visible.map((p) => p.id);
  const totalProjects = visible.length;
  const closed = visible.filter((p) => p.stage === "CLOSED");
  const activeProjects = totalProjects - closed.length;

  const onTimeEligible = closed.filter((p) => p.targetEndDate && p.actualEndDate);
  const onTimeCount = onTimeEligible.filter((p) => p.actualEndDate!.getTime() <= p.targetEndDate!.getTime()).length;
  const onTimeRate = onTimeEligible.length ? Math.round((onTimeCount / onTimeEligible.length) * 100) : null;

  const onBudgetEligible = closed.filter((p) => (p.budgetPlanned ?? 0) > 0);
  const onBudgetCount = onBudgetEligible.filter(
    (p) => budgetVariancePercent(p as unknown as ProjectForHealth) < ON_BUDGET_VARIANCE_THRESHOLD
  ).length;
  const onBudgetRate = onBudgetEligible.length ? Math.round((onBudgetCount / onBudgetEligible.length) * 100) : null;

  const successEligible = closed.filter((p) => p.targetEndDate && p.actualEndDate && (p.budgetPlanned ?? 0) > 0);
  const successCount = successEligible.filter(
    (p) =>
      p.actualEndDate!.getTime() <= p.targetEndDate!.getTime() &&
      budgetVariancePercent(p as unknown as ProjectForHealth) < ON_BUDGET_VARIANCE_THRESHOLD
  ).length;
  const successRate = successEligible.length ? Math.round((successCount / successEligible.length) * 100) : null;

  const avgBudgetVariancePercent = onBudgetEligible.length
    ? Math.round(
        onBudgetEligible.reduce((s, p) => s + budgetVariancePercent(p as unknown as ProjectForHealth), 0) /
          onBudgetEligible.length
      )
    : null;

  // Resource utilization: sum of allocationPercent across only this user's *visible* projects,
  // per resource -- so this answers "utilization on projects I can see," not portfolio-wide
  // truth for a resource who might also be booked on projects outside this user's visibility.
  const allocRows = projectIds.length
    ? await db
        .select({ resourceId: projectResources.resourceId, allocationPercent: projectResources.allocationPercent })
        .from(projectResources)
        .where(inArray(projectResources.projectId, projectIds))
    : [];
  const allocByResource = new Map<string, number>();
  for (const r of allocRows) {
    allocByResource.set(r.resourceId, (allocByResource.get(r.resourceId) ?? 0) + r.allocationPercent);
  }
  const resourceIds = [...allocByResource.keys()];
  const resourceRows = resourceIds.length
    ? await db
        .select({ id: resources.id, name: resources.name, role: resources.role, capacityHoursPerWk: resources.capacityHoursPerWk })
        .from(resources)
        .where(inArray(resources.id, resourceIds))
    : [];
  const resourceUtilization: ResourceUtilizationRow[] = resourceRows
    .map((r) => ({
      resourceId: r.id,
      name: r.name,
      role: r.role,
      capacityHoursPerWk: r.capacityHoursPerWk,
      allocatedPercent: allocByResource.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.allocatedPercent - a.allocatedPercent);
  const avgResourceUtilizationPercent = resourceUtilization.length
    ? Math.round(resourceUtilization.reduce((s, r) => s + r.allocatedPercent, 0) / resourceUtilization.length)
    : null;
  const overAllocatedCount = resourceUtilization.filter((r) => r.allocatedPercent > 100).length;

  // CSAT/NPS trend: last 6 calendar months of completed satisfaction survey responses across
  // this user's visible projects, bucketed by the month the response came in.
  const rangeStart = new Date();
  rangeStart.setMonth(rangeStart.getMonth() - 5);
  rangeStart.setDate(1);
  rangeStart.setHours(0, 0, 0, 0);

  const surveyRows = projectIds.length
    ? await db
        .select({
          csatScore: satisfactionSurveys.csatScore,
          npsScore: satisfactionSurveys.npsScore,
          respondedAt: satisfactionSurveys.respondedAt,
        })
        .from(satisfactionSurveys)
        .where(
          and(
            inArray(satisfactionSurveys.projectId, projectIds),
            eq(satisfactionSurveys.status, "COMPLETED"),
            gte(satisfactionSurveys.respondedAt, rangeStart)
          )
        )
    : [];

  const months: string[] = [];
  const cursor = new Date(rangeStart);
  for (let i = 0; i < 6; i++) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const byMonth = new Map<string, { csat: number[]; nps: number[]; count: number }>();
  for (const m of months) byMonth.set(m, { csat: [], nps: [], count: 0 });
  for (const row of surveyRows) {
    if (!row.respondedAt) continue;
    const key = monthKey(row.respondedAt);
    const bucket = byMonth.get(key);
    if (!bucket) continue; // outside the 6-month window (shouldn't happen given the query filter, but be defensive)
    bucket.count += 1;
    if (row.csatScore != null) bucket.csat.push(row.csatScore);
    if (row.npsScore != null) bucket.nps.push(row.npsScore);
  }
  const csatTrend: CsatMonthBucket[] = months.map((m) => {
    const bucket = byMonth.get(m)!;
    return {
      monthKey: m,
      avgCsat: avg(bucket.csat),
      avgNps: avg(bucket.nps),
      responseCount: bucket.count,
    };
  });
  const allCsat = surveyRows.map((r) => r.csatScore).filter((v): v is number => v != null);
  const allNps = surveyRows.map((r) => r.npsScore).filter((v): v is number => v != null);

  return {
    totalProjects,
    activeProjects,
    closedProjects: closed.length,
    onTimeRate,
    onTimeSampleSize: onTimeEligible.length,
    onBudgetRate,
    onBudgetSampleSize: onBudgetEligible.length,
    successRate,
    successSampleSize: successEligible.length,
    avgBudgetVariancePercent,
    resourceUtilization,
    avgResourceUtilizationPercent,
    overAllocatedCount,
    csatTrend,
    overallAvgCsat: avg(allCsat),
    overallAvgNps: avg(allNps),
    csatResponseCount: surveyRows.length,
  };
}
