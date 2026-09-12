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
