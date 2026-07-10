import type { getProjectDetail } from "./portfolio";

export type PlannedVsActual = {
  budget: { planned: number; actual: number };
  schedule: { plannedPercent: number; actualPercent: number };
  effort: { plannedHours: number; actualHours: number };
};

// Builds the "planned vs actual" dataset shown as a chart in the status report,
// covering the three KPIs leadership cares about most: budget, schedule, effort.
export function buildPlannedVsActual(detail: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>): PlannedVsActual {
  const p = detail.project;

  const budget = {
    planned: Math.round(p.budgetPlanned ?? 0),
    actual: Math.round(p.budgetActual ?? 0),
  };

  let plannedPercent = 0;
  if (p.startDate && p.targetEndDate) {
    const start = p.startDate.getTime();
    const end = p.targetEndDate.getTime();
    const now = Date.now();
    if (end > start) {
      plannedPercent = Math.round(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)));
    }
  }
  const schedule = {
    plannedPercent,
    actualPercent: p.percentComplete ?? 0,
  };

  const plannedHours = detail.tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);
  const actualHours = detail.tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);
  const effort = {
    plannedHours: Math.round(plannedHours),
    actualHours: Math.round(actualHours),
  };

  return { budget, schedule, effort };
}
