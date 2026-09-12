import { findRate, type RateCardEntry, type SourcingType } from "./deliveryModel";

// Deterministic (non-AI) demand-pipeline forecast. Same philosophy as supportEstimate.ts:
// every assumption here is a plain, editable number, not a model's guess — this turns the
// backlog's coarse t-shirt sizing into hours, a rough blended cost, and a projected clearing
// timeline, using an assumed weekly team throughput. Feature 1 of the forecasting roadmap;
// Feature 2 (skills/resource capacity + role-accurate cost) and Feature 3 (schedule/cost EAC
// on active projects) build out lib/forecast.ts further alongside this.

export type EffortSize = "S" | "M" | "L" | "XL";

// Rough hours-per-size, deliberately separate from demand.ts's EFFORT_WEIGHT. That one is a
// unitless divisor used only to rank the backlog (value+urgency / weight); this one is a real
// hours estimate used to project timeline and cost. Keeping them apart means recalibrating
// one (e.g. "an XL is really more like 1500h") doesn't silently move the other's ranking math.
export const EFFORT_HOURS: Record<EffortSize, number> = { S: 40, M: 160, L: 480, XL: 1200 };

export type ForecastAssumptions = {
  effortHours: Record<EffortSize, number>;
  // $/hr blended across roles — a rough placeholder for pipeline-level costing. Feature 2
  // replaces this with an actual per-role rate-card lookup once a demand item is skill-tagged;
  // until then this matches deliveryModel.ts's ONSITE fallback rate, so the two rough numbers
  // in the app agree with each other.
  blendedHourlyRate: number;
  // Assumed hours/week the org can throw at new/backlog work. ~160h/wk is a starting
  // assumption (roughly 4 FTEs at 40h/wk) — always editable, never measured automatically,
  // same "transparent baseline" stance as supportEstimate's effectiveHoursPerFte.
  teamCapacityHoursPerWeek: number;
};

export const DEFAULT_FORECAST_ASSUMPTIONS: ForecastAssumptions = {
  effortHours: EFFORT_HOURS,
  blendedHourlyRate: 90,
  teamCapacityHoursPerWeek: 160,
};

// Statuses still "in flight" toward becoming real project work. DEFERRED/REJECTED are
// excluded (dead for now, revisit later); CONVERTED is excluded because it's already a real
// project and therefore already inside the *other* forecasts (Feature 3's schedule/cost EAC)
// — counting it here too would double-count the same work under two different forecasts.
export const PIPELINE_STATUSES = ["SUBMITTED", "TRIAGED", "SCORED", "APPROVED"] as const;

export type ForecastableDemand = {
  id: string;
  title: string;
  status: string;
  type: string | null;
  effortTshirtSize: string | null;
  priorityScore: number | null;
  divisionId: string | null;
  createdAt: string | Date;
};

export type DemandForecastItem = {
  id: string;
  title: string;
  status: string;
  type: string | null;
  divisionId: string | null;
  effortSize: EffortSize; // resolved, defaulting to "M" when not yet scored
  hours: number;
  cost: number;
  cumulativeHoursBefore: number; // hours ahead of this item in queue order
  projectedStartWeek: number; // 0 = could start this week, given the queue ahead of it
};

export type DemandForecastGroup = { key: string; hours: number; cost: number; count: number };

export type DemandForecastResult = {
  items: DemandForecastItem[]; // in queue order: APPROVED (committed) first, then by priority score
  totalHours: number;
  totalCost: number;
  weeksToClear: number;
  byDivision: DemandForecastGroup[];
  byType: DemandForecastGroup[];
  assumptions: ForecastAssumptions;
};

const SIZES: EffortSize[] = ["S", "M", "L", "XL"];

function resolveEffortSize(size: string | null): EffortSize {
  return (SIZES as string[]).includes(size ?? "") ? (size as EffortSize) : "M";
}

export function computeDemandForecast(
  demand: ForecastableDemand[],
  divisionNameById: Map<string, string>,
  assumptions: ForecastAssumptions = DEFAULT_FORECAST_ASSUMPTIONS
): DemandForecastResult {
  const pipeline = demand.filter((d) => (PIPELINE_STATUSES as readonly string[]).includes(d.status));

  // Queue order: APPROVED items are already committed and go first, oldest-approved-first
  // (first-in-first-out); everything else is ranked by priority score, the same ordering the
  // Demand page itself already sorts the backlog by.
  const approved = [...pipeline]
    .filter((d) => d.status === "APPROVED")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const rest = [...pipeline]
    .filter((d) => d.status !== "APPROVED")
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  const ordered = [...approved, ...rest];

  let cumulativeHours = 0;
  const items: DemandForecastItem[] = ordered.map((d) => {
    const effortSize = resolveEffortSize(d.effortTshirtSize);
    const hours = assumptions.effortHours[effortSize];
    const cost = hours * assumptions.blendedHourlyRate;
    const cumulativeHoursBefore = cumulativeHours;
    const projectedStartWeek =
      assumptions.teamCapacityHoursPerWeek > 0 ? Math.floor(cumulativeHoursBefore / assumptions.teamCapacityHoursPerWeek) : 0;
    cumulativeHours += hours;
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      type: d.type,
      divisionId: d.divisionId,
      effortSize,
      hours,
      cost,
      cumulativeHoursBefore,
      projectedStartWeek,
    };
  });

  const totalHours = items.reduce((s, i) => s + i.hours, 0);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  const weeksToClear = assumptions.teamCapacityHoursPerWeek > 0 ? Math.ceil(totalHours / assumptions.teamCapacityHoursPerWeek) : 0;

  function groupBy(keyFn: (i: DemandForecastItem) => string): DemandForecastGroup[] {
    const map = new Map<string, DemandForecastGroup>();
    for (const item of items) {
      const key = keyFn(item);
      const g = map.get(key) ?? { key, hours: 0, cost: 0, count: 0 };
      g.hours += item.hours;
      g.cost += item.cost;
      g.count += 1;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }

  const byDivision = groupBy((i) => (i.divisionId ? divisionNameById.get(i.divisionId) ?? "Unknown division" : "No division"));
  const byType = groupBy((i) => (i.type ? i.type.replace(/_/g, " ") : "Untyped"));

  return { items, totalHours, totalCost, weeksToClear, byDivision, byType, assumptions };
}

// -----------------------------------------------------------------------------------------
// Feature 2: skills/resource capacity forecast + projected cost.
//
// Looks at unstaffed work across active projects (tasks with no assigneeId, tagged with
// tasks.requiredSkills), matches each required skill against the resource roster's
// resources.skills[], nets out each matched resource's current allocation across all their
// other projects (projectResources.allocationPercent) to find real spare capacity, and
// projects a cost: the portion coverable by existing staff at their own costPerHour, plus
// whatever's left over (a genuine gap) priced at a rate-card lookup. Same deterministic,
// editable-assumptions stance as the demand forecast above and supportEstimate.ts.
// -----------------------------------------------------------------------------------------

export type SkillDemandTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  requiredSkills: string[] | null;
  estimateHours: number | null;
  dueDate: string | Date | null;
};

export type ResourceForCapacity = {
  id: string;
  name: string;
  skills: string[] | null;
  capacityHoursPerWk: number | null;
  costPerHour: number | null;
};

export type SkillCapacityAssumptions = {
  defaultTaskHours: number; // fallback when a task has no estimateHours logged yet
  horizonWeeks: number; // planning horizon spare capacity is measured against
  sourcingTypeForGapRate: SourcingType; // rate-card column used to price hours that can't be covered by existing staff
};

export const DEFAULT_SKILL_CAPACITY_ASSUMPTIONS: SkillCapacityAssumptions = {
  defaultTaskHours: 20,
  horizonWeeks: 4,
  sourcingTypeForGapRate: "ONSITE",
};

export type SkillGapTaskRef = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  hours: number;
  dueDate: string | Date | null;
};

export type SkillGap = {
  skill: string;
  demandHours: number;
  matchedResourceCount: number;
  matchedResourceNames: string[];
  availableCapacityHours: number; // spare capacity across matched resources, over the horizon
  gapHours: number; // demand beyond what spare capacity can absorb
  coveredCost: number; // portion covered by existing staff, at their own blended costPerHour
  gapRate: number; // $/hr used to price the uncovered portion — see rate-card-lookup caveat below
  gapCost: number;
  totalCost: number;
  tasks: SkillGapTaskRef[];
};

export type SkillCapacityForecastResult = {
  skills: SkillGap[]; // sorted by gapHours desc, then demandHours desc — biggest risk first
  totalDemandHours: number;
  totalGapHours: number;
  totalProjectedCost: number;
  skillsWithNoCoverage: number; // matchedResourceCount === 0 — nobody on the roster has this skill at all
  assumptions: SkillCapacityAssumptions;
};

// Sums a resource's allocationPercent across every (active) project they're staffed on. Can
// exceed 100 for a genuinely double-booked resource — spare capacity below is floored at 0
// rather than going negative, but the raw total is left uncapped here since "218% allocated"
// is itself a useful red flag a caller may want to surface.
export function totalAllocationByResource(allocations: { resourceId: string; allocationPercent: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of allocations) {
    map.set(a.resourceId, (map.get(a.resourceId) ?? 0) + a.allocationPercent);
  }
  return map;
}

function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

export function computeSkillCapacityForecast(
  unstaffedTasks: SkillDemandTask[],
  resources: ResourceForCapacity[],
  allocationPercentByResource: Map<string, number>,
  rateCards: RateCardEntry[],
  assumptions: SkillCapacityAssumptions = DEFAULT_SKILL_CAPACITY_ASSUMPTIONS
): SkillCapacityForecastResult {
  // Group unstaffed task hours by required skill. A task naming multiple required skills adds
  // its hours to each one, deliberately not split across them — covering just one of a task's
  // required skills doesn't reduce how much of the work still needs doing.
  const demandBySkill = new Map<string, { hours: number; tasks: SkillGapTaskRef[] }>();
  for (const t of unstaffedTasks) {
    const skills = (t.requiredSkills ?? []).map(normalizeSkill).filter(Boolean);
    if (skills.length === 0) continue;
    const hours = t.estimateHours && t.estimateHours > 0 ? t.estimateHours : assumptions.defaultTaskHours;
    for (const skill of skills) {
      const entry = demandBySkill.get(skill) ?? { hours: 0, tasks: [] };
      entry.hours += hours;
      entry.tasks.push({ id: t.id, projectId: t.projectId, projectName: t.projectName, title: t.title, hours, dueDate: t.dueDate });
      demandBySkill.set(skill, entry);
    }
  }

  const gaps: SkillGap[] = [];
  for (const [skill, { hours: demandHours, tasks }] of demandBySkill.entries()) {
    const matched = resources.filter((r) => (r.skills ?? []).some((s) => normalizeSkill(s) === skill));

    let availableCapacityHours = 0;
    let weightedCostSum = 0; // for a spare-capacity-weighted blended $/hr across matched resources
    for (const r of matched) {
      const weeklyCapacity = r.capacityHoursPerWk ?? 40;
      const allocated = Math.min(100, allocationPercentByResource.get(r.id) ?? 0);
      const spareWeekly = weeklyCapacity * (1 - allocated / 100);
      const spareOverHorizon = Math.max(0, spareWeekly * assumptions.horizonWeeks);
      availableCapacityHours += spareOverHorizon;
      weightedCostSum += spareOverHorizon * (r.costPerHour ?? 0);
    }

    const coveredHours = Math.min(demandHours, availableCapacityHours);
    const gapHours = Math.max(0, demandHours - availableCapacityHours);
    const avgInternalRate = availableCapacityHours > 0 ? weightedCostSum / availableCapacityHours : 0;
    const coveredCost = coveredHours * avgInternalRate;
    // Rough on purpose: rate cards are keyed by role (e.g. "Data Engineer"), not by individual
    // skill tags (e.g. "Snowflake") — an exact match is the exception, not the rule. findRate's
    // built-in fallback (same-sourcing-type average, then a flat default) keeps this from ever
    // silently costing a gap at $0; a precise per-role lookup needs skill-to-role mapping this
    // MVP doesn't attempt.
    const gapRate = findRate(rateCards, skill, assumptions.sourcingTypeForGapRate);
    const gapCost = gapHours * gapRate;

    gaps.push({
      skill,
      demandHours,
      matchedResourceCount: matched.length,
      matchedResourceNames: matched.map((r) => r.name),
      availableCapacityHours,
      gapHours,
      coveredCost,
      gapRate,
      gapCost,
      totalCost: coveredCost + gapCost,
      tasks: tasks.sort((a, b) => {
        const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return at - bt;
      }),
    });
  }

  gaps.sort((a, b) => b.gapHours - a.gapHours || b.demandHours - a.demandHours);

  return {
    skills: gaps,
    totalDemandHours: gaps.reduce((s, g) => s + g.demandHours, 0),
    totalGapHours: gaps.reduce((s, g) => s + g.gapHours, 0),
    totalProjectedCost: gaps.reduce((s, g) => s + g.totalCost, 0),
    skillsWithNoCoverage: gaps.filter((g) => g.matchedResourceCount === 0).length,
    assumptions,
  };
}

// -----------------------------------------------------------------------------------------
// Feature 3: project cost & schedule Estimate-At-Completion (EAC) forecast.
//
// The obvious way to build this would be to project `budgetActual` and `percentComplete`
// forward. That doesn't hold up under inspection: both are plain numbers a PM types into a
// form (see OverviewTab.tsx / StatusTab.tsx's number inputs) — nothing in the codebase ever
// auto-computes either one, so budgetActual sits at the schema default of $0 on any project
// nobody has manually updated, and percentComplete is only as fresh as the last status
// update someone bothered to file. An EAC built on top of those would look precise while
// resting on numbers nobody is obliged to keep current.
//
// Instead this uses the one figure the app *does* keep current automatically: tasks.actualHours,
// which recomputeActualHours() re-sums from real logged time entries on every add/delete (see
// the time-entries API routes). From tasks + resources + invoices we derive, per project:
//   - actualCostToDate: sum(task.actualHours x assignee's costPerHour), falling back to the
//     same blendedHourlyRate constant used elsewhere for unassigned tasks or resources with no
//     rate on file, plus any invoice not sitting in PENDING (PAID/OVERDUE/DISPUTED all mean the
//     cost was actually incurred, whether or not it has been settled yet)
//   - physicalPercentComplete: actualHours / estimateHours summed across the project's tasks —
//     this can't go stale the way a status-update field can, since it only moves when real
//     hours get logged against real estimates
// EAC follows the standard "assume today's burn rate holds" formula: EAC = actualCostToDate /
// physicalPercentComplete. Below assumptions.minPercentCompleteForEac this is deliberately
// withheld (insufficientData: true) rather than shown, since dividing by a tiny percentage
// turns early noise into a wild, misleading number. The same "hold the current pace" idea is
// applied to elapsed calendar time to project a schedule EAC (a projected completion date)
// against the project's targetEndDate.
// -----------------------------------------------------------------------------------------

export type EACAssumptions = {
  // $/hr fallback for a task with no assignee, or an assignee with no costPerHour on file —
  // same constant used as the blended rate elsewhere in this file, so the app's various rough
  // dollar figures agree with each other.
  blendedHourlyRate: number;
  // Below this fraction of physical completion, EAC/VAC/schedule projection are withheld
  // rather than shown — an early number divided by e.g. 1% complete swings wildly with every
  // hour logged and would do more to mislead than inform.
  minPercentCompleteForEac: number;
  // Invoice statuses treated as cost actually incurred (as opposed to PENDING — not yet a
  // real, booked cost).
  invoiceStatusesCountedAsIncurred: string[];
};

export const DEFAULT_EAC_ASSUMPTIONS: EACAssumptions = {
  blendedHourlyRate: 90,
  minPercentCompleteForEac: 0.05,
  invoiceStatusesCountedAsIncurred: ["PAID", "OVERDUE", "DISPUTED"],
};

export type EACTaskInput = {
  id: string;
  assigneeId: string | null;
  estimateHours: number | null;
  actualHours: number | null;
};

export type EACResourceInput = { id: string; costPerHour: number | null };

export type EACInvoiceInput = { amount: number; status: string };

export type EACProjectInput = {
  id: string;
  name: string;
  budgetPlanned: number | null;
  startDate: string | Date | null;
  targetEndDate: string | Date | null;
};

export type ProjectEACResult = {
  projectId: string;
  projectName: string;
  totalEstimateHours: number;
  totalActualHours: number;
  physicalPercentComplete: number | null; // null when the project has no estimated hours yet
  laborCostToDate: number;
  invoiceCostToDate: number;
  actualCostToDate: number;
  budgetPlanned: number;
  eac: number | null; // null when insufficientData
  vac: number | null; // budgetPlanned - eac; positive = projected to come in under budget
  insufficientData: boolean; // true when physical % complete is null or below the minimum threshold
  scheduleStartDate: string | null;
  scheduleTargetEndDate: string | null;
  projectedEndDate: string | null; // null when insufficientData or startDate is missing
  scheduleSlipDays: number | null; // positive = projected to finish late; null when not computable
};

export function computeProjectEAC(
  project: EACProjectInput,
  tasks: EACTaskInput[],
  resources: EACResourceInput[],
  invoices: EACInvoiceInput[],
  assumptions: EACAssumptions = DEFAULT_EAC_ASSUMPTIONS,
  now: Date = new Date()
): ProjectEACResult {
  const rateByResource = new Map(
    resources.map((r) => [r.id, r.costPerHour && r.costPerHour > 0 ? r.costPerHour : assumptions.blendedHourlyRate])
  );

  let totalEstimateHours = 0;
  let totalActualHours = 0;
  let laborCostToDate = 0;
  for (const t of tasks) {
    const est = t.estimateHours ?? 0;
    const act = t.actualHours ?? 0;
    totalEstimateHours += est;
    totalActualHours += act;
    const rate = t.assigneeId ? rateByResource.get(t.assigneeId) ?? assumptions.blendedHourlyRate : assumptions.blendedHourlyRate;
    laborCostToDate += act * rate;
  }

  const invoiceCostToDate = invoices
    .filter((inv) => assumptions.invoiceStatusesCountedAsIncurred.includes(inv.status))
    .reduce((s, inv) => s + inv.amount, 0);
  const actualCostToDate = laborCostToDate + invoiceCostToDate;

  const physicalPercentComplete = totalEstimateHours > 0 ? totalActualHours / totalEstimateHours : null;
  const budgetPlanned = project.budgetPlanned ?? 0;

  const hasEnoughProgress = physicalPercentComplete !== null && physicalPercentComplete >= assumptions.minPercentCompleteForEac;
  const eac = hasEnoughProgress ? actualCostToDate / (physicalPercentComplete as number) : null;
  const vac = eac !== null && budgetPlanned > 0 ? budgetPlanned - eac : null;

  const start = project.startDate ? new Date(project.startDate) : null;
  const target = project.targetEndDate ? new Date(project.targetEndDate) : null;
  let projectedEndDate: string | null = null;
  let scheduleSlipDays: number | null = null;
  if (start && hasEnoughProgress) {
    const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / 86_400_000);
    const projectedTotalDays = elapsedDays / (physicalPercentComplete as number);
    const projected = new Date(start.getTime() + projectedTotalDays * 86_400_000);
    projectedEndDate = projected.toISOString();
    if (target) {
      scheduleSlipDays = Math.round((projected.getTime() - target.getTime()) / 86_400_000);
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    totalEstimateHours,
    totalActualHours,
    physicalPercentComplete,
    laborCostToDate,
    invoiceCostToDate,
    actualCostToDate,
    budgetPlanned,
    eac,
    vac,
    insufficientData: !hasEnoughProgress,
    scheduleStartDate: start ? start.toISOString() : null,
    scheduleTargetEndDate: target ? target.toISOString() : null,
    projectedEndDate,
    scheduleSlipDays,
  };
}

export type PortfolioEACResult = {
  projects: ProjectEACResult[]; // sorted: at-risk (over budget or projected late) first, then by actualCostToDate desc
  totalBudgetPlanned: number;
  totalActualCostToDate: number;
  totalProjectedCost: number; // sum of eac where computable, actualCostToDate as a floor otherwise
  projectsAtRisk: number; // vac < 0 (projected overrun) or scheduleSlipDays > 0 (projected late)
  projectsWithInsufficientData: number;
  assumptions: EACAssumptions;
};

export function computePortfolioEAC(
  projects: EACProjectInput[],
  tasksByProject: Map<string, EACTaskInput[]>,
  resources: EACResourceInput[],
  invoicesByProject: Map<string, EACInvoiceInput[]>,
  assumptions: EACAssumptions = DEFAULT_EAC_ASSUMPTIONS,
  now: Date = new Date()
): PortfolioEACResult {
  const results = projects.map((p) =>
    computeProjectEAC(p, tasksByProject.get(p.id) ?? [], resources, invoicesByProject.get(p.id) ?? [], assumptions, now)
  );

  function isAtRisk(r: ProjectEACResult) {
    return (r.vac !== null && r.vac < 0) || (r.scheduleSlipDays !== null && r.scheduleSlipDays > 0);
  }

  results.sort((a, b) => {
    const riskDiff = Number(isAtRisk(b)) - Number(isAtRisk(a));
    if (riskDiff !== 0) return riskDiff;
    return b.actualCostToDate - a.actualCostToDate;
  });

  return {
    projects: results,
    totalBudgetPlanned: results.reduce((s, r) => s + r.budgetPlanned, 0),
    totalActualCostToDate: results.reduce((s, r) => s + r.actualCostToDate, 0),
    totalProjectedCost: results.reduce((s, r) => s + (r.eac ?? r.actualCostToDate), 0),
    projectsAtRisk: results.filter(isAtRisk).length,
    projectsWithInsufficientData: results.filter((r) => r.insufficientData).length,
    assumptions,
  };
}
