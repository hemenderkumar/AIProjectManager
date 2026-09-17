// Turns the Business Case's already-captured unit economics (quotedUnitPrice,
// targetMonthlyVolume, targetMarginPercent) and funding ask into a month-by-month benefits/ROI
// trajectory, so "the roadmap" can be shown as a line chart of value over time instead of a wall
// of text. Shared between the in-app formal preview (BusinessCasePreview.tsx, where the user
// picks the duration) and the PPTX export (businessCaseExport.ts, fixed at a 3-year/quarterly
// view) so both render the identical numbers.
//
// Model, deliberately simple and stated up front rather than hidden in the math: volume ramps
// linearly from 0 to the target monthly volume over `rampMonths` (default 6), then holds flat.
// Monthly net benefit = that month's revenue x the target margin (the margin already nets out
// material + staffing cost per Charter's Staffing & Margin recommendation, so this doesn't
// double-subtract costs). Cumulative ROI = (cumulative net benefit - upfront investment) /
// upfront investment. This is a projection built only from numbers already on the project, not
// an invented growth curve -- it will only render once price, volume, margin, and a funding
// figure are all actually set.

export type RoiSeriesPoint = {
  month: number; // 1-indexed
  cumulativeRevenue: number;
  cumulativeNetBenefit: number; // cumulative profit minus the upfront investment
  roiPercent: number;
};

export type RoiProjectionInput = {
  quotedUnitPrice: number | null;
  targetMonthlyVolume: number | null;
  targetMarginPercent: number | null;
  upfrontInvestment: number | null;
  rampMonths?: number;
};

export function computeUpfrontInvestment(
  implementationItems: { amount: number }[],
  contingencyPercent: number | null,
  totalFundingRequired: number | null
): number | null {
  if (totalFundingRequired != null) return totalFundingRequired;
  const implTotal = implementationItems.reduce((s, i) => s + i.amount, 0);
  if (!implTotal) return null;
  const contingencyAmount = contingencyPercent != null ? implTotal * (contingencyPercent / 100) : 0;
  return Math.round(implTotal + contingencyAmount);
}

// Returns null when the inputs needed to project anything real aren't set yet, rather than
// silently charting zeroes.
export function computeRoiSeries(input: RoiProjectionInput, months: number): RoiSeriesPoint[] | null {
  const { quotedUnitPrice, targetMonthlyVolume, targetMarginPercent, upfrontInvestment, rampMonths = 6 } = input;
  if (quotedUnitPrice == null || targetMonthlyVolume == null || targetMarginPercent == null || !upfrontInvestment) {
    return null;
  }
  const points: RoiSeriesPoint[] = [];
  let cumulativeRevenue = 0;
  let cumulativeProfit = 0;
  for (let m = 1; m <= months; m++) {
    const ramp = Math.min(1, m / rampMonths);
    const revenue = targetMonthlyVolume * ramp * quotedUnitPrice;
    cumulativeRevenue += revenue;
    cumulativeProfit += revenue * (targetMarginPercent / 100);
    const cumulativeNetBenefit = cumulativeProfit - upfrontInvestment;
    points.push({
      month: m,
      cumulativeRevenue: Math.round(cumulativeRevenue),
      cumulativeNetBenefit: Math.round(cumulativeNetBenefit),
      roiPercent: Math.round((cumulativeNetBenefit / upfrontInvestment) * 1000) / 10,
    });
  }
  return points;
}
