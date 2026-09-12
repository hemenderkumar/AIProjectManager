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
