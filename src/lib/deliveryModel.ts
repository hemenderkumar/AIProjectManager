// Deterministic delivery-model math: given a rate card (role + sourcing type -> $/hr) and
// a role's hours + onsite/offshore/contractor split, compute a blended rate and cost.
// AI is used only to *recommend* the split and pricing model (a judgment call) — the
// arithmetic and rate lookups here are always plain, editable, and never invented.

export type SourcingType = "ONSITE" | "OFFSHORE" | "CONTRACTOR";

export const SOURCING_TYPES: SourcingType[] = ["ONSITE", "OFFSHORE", "CONTRACTOR"];

export const SOURCING_LABELS: Record<SourcingType, string> = {
  ONSITE: "Onsite",
  OFFSHORE: "Offshore",
  CONTRACTOR: "Contractor",
};

export type PricingModel = "FIXED_BID" | "TIME_AND_MATERIALS" | "HYBRID";

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  FIXED_BID: "Fixed Bid",
  TIME_AND_MATERIALS: "Time & Materials",
  HYBRID: "Hybrid (Fixed Bid + T&M)",
};

// Used ONLY when a role has no matching rate card entry for a sourcing type — a rough,
// clearly-labeled fallback so the calculator never silently uses $0. Always overridable
// by adding a real rate card row on the Resources page.
export const FALLBACK_RATES: Record<SourcingType, number> = {
  ONSITE: 90,
  OFFSHORE: 45,
  CONTRACTOR: 110,
};

export type RateCardEntry = {
  role: string;
  sourcingType: SourcingType;
  hourlyRate: number;
};

export type RoleMixRow = {
  id?: string;
  role: string;
  hours: number;
  onsitePercent: number;
  offshorePercent: number;
  contractorPercent: number;
};

export function findRate(rateCards: RateCardEntry[], role: string, sourcingType: SourcingType): number {
  const exact = rateCards.find(
    (r) => r.role.trim().toLowerCase() === role.trim().toLowerCase() && r.sourcingType === sourcingType
  );
  if (exact) return exact.hourlyRate;
  const sameType = rateCards.filter((r) => r.sourcingType === sourcingType);
  if (sameType.length > 0) {
    return sameType.reduce((s, r) => s + r.hourlyRate, 0) / sameType.length;
  }
  return FALLBACK_RATES[sourcingType];
}

export function mixTotal(row: RoleMixRow): number {
  return row.onsitePercent + row.offshorePercent + row.contractorPercent;
}

export function blendedRate(rateCards: RateCardEntry[], row: RoleMixRow): number {
  const total = mixTotal(row) || 100;
  const onsite = findRate(rateCards, row.role, "ONSITE");
  const offshore = findRate(rateCards, row.role, "OFFSHORE");
  const contractor = findRate(rateCards, row.role, "CONTRACTOR");
  return (
    (row.onsitePercent / total) * onsite +
    (row.offshorePercent / total) * offshore +
    (row.contractorPercent / total) * contractor
  );
}

export function rowCost(rateCards: RateCardEntry[], row: RoleMixRow): number {
  return blendedRate(rateCards, row) * row.hours;
}

export function allOnsiteCost(rateCards: RateCardEntry[], row: RoleMixRow): number {
  return findRate(rateCards, row.role, "ONSITE") * row.hours;
}

export function allOffshoreCost(rateCards: RateCardEntry[], row: RoleMixRow): number {
  return findRate(rateCards, row.role, "OFFSHORE") * row.hours;
}

export type MixTotals = {
  totalHours: number;
  recommendedCost: number;
  allOnsiteCost: number;
  allOffshoreCost: number;
  savingsVsAllOnsite: number;
};

export function computeMixTotals(rateCards: RateCardEntry[], rows: RoleMixRow[]): MixTotals {
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const recommendedCost = rows.reduce((s, r) => s + rowCost(rateCards, r), 0);
  const onsite = rows.reduce((s, r) => s + allOnsiteCost(rateCards, r), 0);
  const offshore = rows.reduce((s, r) => s + allOffshoreCost(rateCards, r), 0);
  return {
    totalHours,
    recommendedCost,
    allOnsiteCost: onsite,
    allOffshoreCost: offshore,
    savingsVsAllOnsite: Math.max(0, onsite - recommendedCost),
  };
}
