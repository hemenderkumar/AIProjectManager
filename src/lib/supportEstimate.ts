// Deterministic (non-AI) ongoing-support cost estimator. Every number here is a plain,
// editable assumption — nothing is invented by a model. The goal is a transparent
// back-of-envelope baseline, not false precision.

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type AppType = "WEB_APP" | "MOBILE_APP" | "API_INTEGRATION" | "DATA_PIPELINE" | "INFRASTRUCTURE" | "OTHER";
export type CoverageTier = "BUSINESS_HOURS" | "EXTENDED" | "ALWAYS_ON";

export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const APP_TYPE_LABELS: Record<AppType, string> = {
  WEB_APP: "Web Application",
  MOBILE_APP: "Mobile App",
  API_INTEGRATION: "API / Integration",
  DATA_PIPELINE: "Data / ETL Pipeline",
  INFRASTRUCTURE: "Infrastructure / Platform",
  OTHER: "Other / Custom",
};

export const COVERAGE_LABELS: Record<CoverageTier, string> = {
  BUSINESS_HOURS: "Business Hours (8x5)",
  EXTENDED: "Extended (12x5)",
  ALWAYS_ON: "24x7",
};

// Baseline assumed tickets/month by severity, per application type. These are starting
// points, not measurements — every value is editable per application in the UI.
export const DEFAULT_TICKETS_PER_MONTH: Record<AppType, Record<Severity, number>> = {
  WEB_APP: { CRITICAL: 1, HIGH: 3, MEDIUM: 8, LOW: 15 },
  MOBILE_APP: { CRITICAL: 1, HIGH: 2, MEDIUM: 6, LOW: 12 },
  API_INTEGRATION: { CRITICAL: 2, HIGH: 4, MEDIUM: 6, LOW: 10 },
  DATA_PIPELINE: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 8 },
  INFRASTRUCTURE: { CRITICAL: 1, HIGH: 3, MEDIUM: 5, LOW: 10 },
  OTHER: { CRITICAL: 1, HIGH: 2, MEDIUM: 5, LOW: 10 },
};

export type SupportApp = {
  id: string;
  name: string;
  appType: AppType;
  tickets: Record<Severity, number>;
};

export type EstimatorAssumptions = {
  resolutionHours: Record<Severity, number>; // labor hours to resolve one ticket of this severity
  blendedHourlyRate: number; // $/hr, blended across support levels
  effectiveHoursPerFte: number; // billable/available hours per support FTE per month
  coverageMultiplier: Record<CoverageTier, number>; // overhead for maintaining a wider coverage window
  sharedDiscount: number; // 0-1, cost reduction from pooling support across multiple apps
  minMonthlyFloorFte: number; // minimum viable retainer, in FTEs, per dedicated support commitment
};

export const DEFAULT_ASSUMPTIONS: EstimatorAssumptions = {
  resolutionHours: { CRITICAL: 4, HIGH: 2, MEDIUM: 1, LOW: 0.5 },
  blendedHourlyRate: 70,
  effectiveHoursPerFte: 130,
  coverageMultiplier: { BUSINESS_HOURS: 1, EXTENDED: 1.3, ALWAYS_ON: 1.75 },
  sharedDiscount: 0.15,
  minMonthlyFloorFte: 0.25,
};

export function emptyTickets(): Record<Severity, number> {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
}

export function defaultTicketsFor(appType: AppType): Record<Severity, number> {
  return { ...DEFAULT_TICKETS_PER_MONTH[appType] };
}

function appMonthlyHours(app: SupportApp, assumptions: EstimatorAssumptions): number {
  return SEVERITIES.reduce((sum, sev) => sum + (app.tickets[sev] || 0) * assumptions.resolutionHours[sev], 0);
}

export type EstimateResult = {
  perAppHours: { id: string; name: string; hours: number; dedicatedCost: number }[];
  totalHours: number;
  fteRequired: number;
  dedicatedMonthlyCost: number;
  sharedMonthlyCost: number;
  selectedMonthlyCost: number;
  savingsFromSharing: number;
  canShare: boolean;
};

export function computeEstimate(
  apps: SupportApp[],
  coverage: CoverageTier,
  shared: boolean,
  assumptions: EstimatorAssumptions
): EstimateResult {
  const coverageMult = assumptions.coverageMultiplier[coverage];
  const rate = assumptions.blendedHourlyRate;
  const floorCost = assumptions.minMonthlyFloorFte * assumptions.effectiveHoursPerFte * rate;

  const perAppHours = apps.map((app) => {
    const hours = appMonthlyHours(app, assumptions);
    const rawCost = hours * coverageMult * rate;
    const dedicatedCost = hours > 0 ? Math.max(rawCost, floorCost) : 0;
    return { id: app.id, name: app.name, hours, dedicatedCost };
  });

  const totalHours = perAppHours.reduce((s, a) => s + a.hours, 0);
  const dedicatedMonthlyCost = perAppHours.reduce((s, a) => s + a.dedicatedCost, 0);

  const canShare = apps.length > 1;
  let sharedMonthlyCost = dedicatedMonthlyCost;
  if (canShare) {
    const rawShared = totalHours * coverageMult * rate * (1 - assumptions.sharedDiscount);
    sharedMonthlyCost = totalHours > 0 ? Math.max(rawShared, floorCost) : 0;
  }

  const selectedMonthlyCost = canShare && shared ? sharedMonthlyCost : dedicatedMonthlyCost;
  const savingsFromSharing = canShare ? Math.max(0, dedicatedMonthlyCost - sharedMonthlyCost) : 0;
  const fteRequired = Math.ceil(((totalHours * coverageMult) / assumptions.effectiveHoursPerFte) * 4) / 4;

  return {
    perAppHours,
    totalHours,
    fteRequired,
    dedicatedMonthlyCost,
    sharedMonthlyCost,
    selectedMonthlyCost,
    savingsFromSharing,
    canShare,
  };
}
