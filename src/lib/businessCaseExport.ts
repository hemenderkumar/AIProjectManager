import type PptxGenJS from "pptxgenjs";
import { BRAND_HEX, setupExecutaPptx, titleSlide, executaSlide } from "./brand";
import { computeUpfrontInvestment, computeRoiSeries } from "./businessCaseRoi";
import { extractRoadmapSteps } from "./businessCaseRoadmap";

type TableRow = PptxGenJS.TableRow;

export type BusinessCaseInput = {
  projectName: string;
  businessCaseExecutiveSummary: string | null;
  problemStatement: string | null;
  businessCase: string | null;
  swotStrengths: string | null;
  swotWeaknesses: string | null;
  swotOpportunities: string | null;
  swotThreats: string | null;
  marketAnalysis: string | null;
  marketPrediction: string | null;
  marketSizeTam: number | null;
  marketSizeSam: number | null;
  marketSizeSom: number | null;
  competitiveDifferentiation: string | null;
  revenueProjections: string | null;
  businessRoadmap: string | null;
  feasibilityScore: number | null;
  recommendedTechnology: string | null;
  technicalRecommendationRationale: string | null;
  quotedUnitPrice: number | null;
  materialCostEstimate: number | null;
  targetMarginPercent: number | null;
  targetMonthlyVolume: number | null;
  contingencyPercent: number | null;
  totalFundingRequired: number | null;
  implementationItems: { name: string; amount: number }[];
  generatedAt: Date;
};

const EMPTY = "—";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function bodySlide(pptx: PptxGenJS, heading: string, kicker?: string) {
  const slide = executaSlide(pptx);
  if (kicker) {
    slide.addText(kicker.toUpperCase(), { x: 0.5, y: 0.28, w: 12.3, h: 0.3, fontSize: 10, bold: true, color: BRAND_HEX.indigo, charSpacing: 1.2 });
  }
  slide.addText(heading, { x: 0.5, y: kicker ? 0.55 : 0.35, w: 12.3, h: 0.6, fontSize: 24, bold: true, color: BRAND_HEX.navy });
  slide.addShape(pptx.ShapeType.line, { x: 0.5, y: kicker ? 1.15 : 1.0, w: 12.3, h: 0, line: { color: BRAND_HEX.border, width: 1 } });
  return slide;
}

// Investor-grade "Financial Forecast & Projections" deck: the idea-evaluation deliverable
// ("should we fund this and why"), separate from the Charter's PM-authorization document.
// Structured like a real investor pitch deck (title, executive summary, agenda, opportunity,
// solution, SWOT, market analysis + quantified TAM/SAM/SOM sizing, competitive
// differentiation, approach, unit economics, revenue chart, benefits/ROI chart, roadmap
// timeline, an Ask slide that leads with "invest $X -> Y% ROI", close) rather than one slide
// per text field, so it's something a PM can actually take to an investor or funding
// committee, not just a screen-for-screen dump of the tab. Every number on the Executive
// Summary / Unit Economics / Revenue / ROI / Ask slides is computed here from the project's
// own quotedUnitPrice/targetMonthlyVolume/cost-item data — never invented — same discipline as
// the AI draft endpoint that fills the narrative fields. Market sizing (TAM/SAM/SOM) is the one
// exception worth calling out: those are PM-entered numbers, never AI-guessed.
export async function generateBusinessCasePptx(input: BusinessCaseInput): Promise<Buffer> {
  const pptx = setupExecutaPptx();

  // 1. Title
  titleSlide(pptx, "Financial Forecast & Projections", input.projectName, input.generatedAt);

  // 1b. Executive Summary — the top-of-deck synthesis, placed right after the title and before
  // the Agenda so a reader gets the pitch before anything else. Deliberately outside the
  // numbered agenda flow, same treatment as the web preview.
  const upfrontInvestmentForSummary = computeUpfrontInvestment(input.implementationItems, input.contingencyPercent, input.totalFundingRequired);
  const summaryRoiSeries = computeRoiSeries(
    {
      quotedUnitPrice: input.quotedUnitPrice,
      targetMonthlyVolume: input.targetMonthlyVolume,
      targetMarginPercent: input.targetMarginPercent,
      upfrontInvestment: upfrontInvestmentForSummary,
    },
    36
  );
  const summaryRoi3yr = summaryRoiSeries?.[summaryRoiSeries.length - 1] ?? null;
  const execSlide = bodySlide(pptx, "Executive Summary");
  execSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.25, w: 0.06, h: 3.0, fill: { color: BRAND_HEX.indigo }, line: { color: BRAND_HEX.indigo, width: 0 } });
  execSlide.addText(input.businessCaseExecutiveSummary?.trim() || EMPTY, {
    x: 0.85, y: 1.25, w: 11.9, h: 3.0, fontSize: 17, color: BRAND_HEX.navy, valign: "top", wrap: true, lineSpacing: 24,
  });
  const summaryStats: [string, string][] = [
    ["Feasibility score", input.feasibilityScore != null ? `${input.feasibilityScore}/100` : "Not scored"],
    ["Funding ask", upfrontInvestmentForSummary != null ? money(upfrontInvestmentForSummary) : "Not set"],
    ["3-year ROI", summaryRoi3yr ? `${summaryRoi3yr.roiPercent}%` : "—"],
  ];
  summaryStats.forEach(([label, value], i) => {
    const x = 0.5 + i * 4.15;
    execSlide.addShape(pptx.ShapeType.roundRect, { x, y: 4.75, w: 3.85, h: 1.5, fill: { color: BRAND_HEX.panel }, line: { color: BRAND_HEX.border, width: 1 }, rectRadius: 0.08 });
    execSlide.addText(value, { x, y: 4.95, w: 3.85, h: 0.8, fontSize: 26, bold: true, color: BRAND_HEX.indigo, align: "center" });
    execSlide.addText(label.toUpperCase(), { x, y: 5.75, w: 3.85, h: 0.35, fontSize: 10, color: BRAND_HEX.muted, align: "center", charSpacing: 1 });
  });

  // 2. Agenda
  const agendaSlide = bodySlide(pptx, "Agenda");
  const agendaItems = [
    "The Opportunity", "Our Solution", "SWOT Analysis", "Market Analysis & Outlook",
    "Competitive Differentiation", "Approach & Technology", "Unit Economics", "Revenue Projections",
    "Benefits & ROI Projection", "Roadmap", "The Ask",
  ];
  agendaItems.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.3;
    const y = 1.35 + row * 0.75;
    agendaSlide.addShape(pptx.ShapeType.ellipse, { x, y: y + 0.04, w: 0.34, h: 0.34, fill: { color: BRAND_HEX.indigo }, line: { color: BRAND_HEX.indigo, width: 0 } });
    agendaSlide.addText(String(i + 1), {
      x, y: y + 0.04, w: 0.34, h: 0.34,
      fontSize: i + 1 >= 10 ? 10 : 12, bold: true, color: BRAND_HEX.white, align: "center", valign: "middle", wrap: false,
    });
    agendaSlide.addText(item, { x: x + 0.5, y, w: 5.4, h: 0.42, fontSize: 14, color: BRAND_HEX.slate, valign: "middle" });
  });

  // 3. The Opportunity (Problem) — with a feasibility stat callout if scored
  const oppSlide = bodySlide(pptx, "The Opportunity", "01 · The Problem");
  oppSlide.addText(input.problemStatement?.trim() || EMPTY, {
    x: 0.5, y: 1.3, w: input.feasibilityScore != null ? 8.6 : 12.3, h: 5.2, fontSize: 16, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  if (input.feasibilityScore != null) {
    oppSlide.addShape(pptx.ShapeType.roundRect, { x: 9.4, y: 1.3, w: 3.4, h: 2.0, fill: { color: "EEF2FF" }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.08 });
    oppSlide.addText(`${input.feasibilityScore}`, { x: 9.4, y: 1.5, w: 3.4, h: 1.0, fontSize: 40, bold: true, color: BRAND_HEX.indigo, align: "center" });
    oppSlide.addText("/ 100 feasibility score", { x: 9.4, y: 2.55, w: 3.4, h: 0.5, fontSize: 11, color: BRAND_HEX.slate, align: "center" });
  }

  // 4. Our Solution / Business Case
  const solutionSlide = bodySlide(pptx, "Our Solution", "02 · The Business Case");
  solutionSlide.addText(input.businessCase?.trim() || EMPTY, {
    x: 0.5, y: 1.3, w: 12.3, h: 5.2, fontSize: 16, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });

  // 5. SWOT — 2x2 grid, each quadrant its own tinted panel with a symbol marker
  const swotSlide = bodySlide(pptx, "SWOT Analysis", "03");
  const quadrants: { label: string; symbol: string; value: string | null; x: number; y: number; fill: string; text: string }[] = [
    { label: "Strengths", symbol: "+", value: input.swotStrengths, x: 0.5, y: 1.2, fill: "ECFDF5", text: "047857" },
    { label: "Weaknesses", symbol: "−", value: input.swotWeaknesses, x: 6.65, y: 1.2, fill: "FEF2F2", text: "B91C1C" },
    { label: "Opportunities", symbol: "↗", value: input.swotOpportunities, x: 0.5, y: 4.15, fill: "EFF6FF", text: "1D4ED8" },
    { label: "Threats", symbol: "!", value: input.swotThreats, x: 6.65, y: 4.15, fill: "FFFBEB", text: "B45309" },
  ];
  for (const q of quadrants) {
    swotSlide.addShape(pptx.ShapeType.roundRect, { x: q.x, y: q.y, w: 6.15, h: 2.75, fill: { color: q.fill }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.06 });
    swotSlide.addShape(pptx.ShapeType.ellipse, { x: q.x + 0.25, y: q.y + 0.18, w: 0.32, h: 0.32, fill: { color: q.text }, line: { color: q.text, width: 0 } });
    swotSlide.addText(q.symbol, { x: q.x + 0.25, y: q.y + 0.18, w: 0.32, h: 0.32, fontSize: 13, bold: true, color: BRAND_HEX.white, align: "center", valign: "middle" });
    swotSlide.addText(q.label, { x: q.x + 0.7, y: q.y + 0.15, w: 5.2, h: 0.4, fontSize: 14, bold: true, color: q.text });
    swotSlide.addText(q.value?.trim() || EMPTY, { x: q.x + 0.25, y: q.y + 0.65, w: 5.65, h: 1.95, fontSize: 11, color: BRAND_HEX.slate, valign: "top", wrap: true });
  }

  // 6. Market Analysis & Outlook — two columns (analysis / prediction) so there's room below
  // for a quantified TAM/SAM/SOM market-sizing row when the PM has entered one.
  const marketSlide = bodySlide(pptx, "Market Analysis & Outlook", "04");
  marketSlide.addText("Market analysis", { x: 0.5, y: 1.3, w: 6.0, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.indigo });
  marketSlide.addText(input.marketAnalysis?.trim() || EMPTY, {
    x: 0.5, y: 1.7, w: 6.0, h: 3.3, fontSize: 12.5, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  marketSlide.addShape(pptx.ShapeType.line, { x: 6.65, y: 1.3, w: 0, h: 3.7, line: { color: BRAND_HEX.border, width: 1 } });
  marketSlide.addText("Market prediction", { x: 6.8, y: 1.3, w: 6.0, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.indigo });
  marketSlide.addText(input.marketPrediction?.trim() || EMPTY, {
    x: 6.8, y: 1.7, w: 6.0, h: 3.3, fontSize: 12.5, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  const marketSizingRows: { label: string; sub: string; value: number }[] = [
    { label: "TAM", sub: "Total Addressable Market", value: input.marketSizeTam ?? 0 },
    { label: "SAM", sub: "Serviceable Available Market", value: input.marketSizeSam ?? 0 },
    { label: "SOM", sub: "Serviceable Obtainable Market", value: input.marketSizeSom ?? 0 },
  ].filter((m) => m.value > 0);
  if (marketSizingRows.length) {
    const maxVal = Math.max(...marketSizingRows.map((m) => m.value));
    marketSlide.addText("Market sizing", { x: 0.5, y: 5.25, w: 12.3, h: 0.35, fontSize: 13, bold: true, color: BRAND_HEX.indigo });
    marketSizingRows.forEach((m, i) => {
      const x = 0.5 + i * 4.15;
      marketSlide.addText(`${m.label}  ·  ${m.sub}`, { x, y: 5.65, w: 3.9, h: 0.3, fontSize: 10, color: BRAND_HEX.muted });
      marketSlide.addText(`${money(m.value)}/yr`, { x, y: 5.9, w: 3.9, h: 0.5, fontSize: 20, bold: true, color: BRAND_HEX.navy });
      marketSlide.addShape(pptx.ShapeType.rect, { x, y: 6.5, w: 3.9, h: 0.12, fill: { color: BRAND_HEX.border }, line: { color: BRAND_HEX.border, width: 0 } });
      marketSlide.addShape(pptx.ShapeType.rect, { x, y: 6.5, w: Math.max(0.15, 3.9 * (m.value / maxVal)), h: 0.12, fill: { color: BRAND_HEX.indigo }, line: { color: BRAND_HEX.indigo, width: 0 } });
    });
  }

  // 6b. Competitive Differentiation — direct "why this wins" vs. the realistic alternative,
  // never real named competitors unless the PM supplied one (same discipline as SWOT/market).
  const compSlide = bodySlide(pptx, "Competitive Differentiation", "05");
  compSlide.addText(input.competitiveDifferentiation?.trim() || EMPTY, {
    x: 0.5, y: 1.3, w: 12.3, h: 5.5, fontSize: 15, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });

  // 7. Approach & Technology
  const approachSlide = bodySlide(pptx, "Approach & Technology", "06 · Why This Will Work");
  approachSlide.addText("Recommended approach", { x: 0.5, y: 1.25, w: 12.3, h: 0.4, fontSize: 15, bold: true, color: BRAND_HEX.indigo });
  approachSlide.addText(input.recommendedTechnology?.trim() || EMPTY, {
    x: 0.5, y: 1.65, w: 12.3, h: 1.4, fontSize: 14, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  approachSlide.addText("Rationale", { x: 0.5, y: 3.15, w: 12.3, h: 0.4, fontSize: 15, bold: true, color: BRAND_HEX.indigo });
  approachSlide.addText(input.technicalRecommendationRationale?.trim() || EMPTY, {
    x: 0.5, y: 3.55, w: 12.3, h: 3.3, fontSize: 13, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });

  // 8. Unit Economics — clean table
  const priceKnown = input.quotedUnitPrice != null;
  const materialKnown = input.materialCostEstimate != null;
  const volumeKnown = input.targetMonthlyVolume != null;
  const monthlyRevenue = priceKnown && volumeKnown ? (input.quotedUnitPrice as number) * (input.targetMonthlyVolume as number) : null;
  const grossMarginPerUnit = priceKnown && materialKnown ? (input.quotedUnitPrice as number) - (input.materialCostEstimate as number) : null;

  const unitEconSlide = bodySlide(pptx, "Unit Economics", "07");
  const unitRows: [string, string][] = [
    ["Quoted unit price", priceKnown ? money(input.quotedUnitPrice as number) : "Not set"],
    ["Material cost / unit", materialKnown ? money(input.materialCostEstimate as number) : "Not set"],
    ["Gross margin / unit (before staffing)", grossMarginPerUnit != null ? money(grossMarginPerUnit) : "—"],
    ["Target margin", input.targetMarginPercent != null ? `${input.targetMarginPercent}%` : "Not set"],
    ["Target monthly volume", volumeKnown ? `${input.targetMonthlyVolume} units/month` : "Not set"],
    ["Modeled monthly revenue", monthlyRevenue != null ? money(monthlyRevenue) : "—"],
  ];
  const header = [
    { text: "Metric", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12 } },
    { text: "Value", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12, align: "right" as const } },
  ];
  const body: TableRow[] = unitRows.map(([label, value]) => [
    { text: label, options: { fontSize: 12, color: BRAND_HEX.slate } },
    { text: value, options: { fontSize: 12, color: BRAND_HEX.navy, bold: true, align: "right" } },
  ]);
  unitEconSlide.addTable([header, ...body], {
    x: 0.5, y: 1.3, w: 12.3, colW: [8, 4.3], fontSize: 12,
    border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
    rowH: 0.55,
  });

  // 9. Revenue Projections — native chart (Conservative / Base / Stretch), computed from
  // quotedUnitPrice x volume, never parsed out of free text.
  const revSlide = bodySlide(pptx, "Revenue Projections", "08");
  if (priceKnown && volumeKnown) {
    const price = input.quotedUnitPrice as number;
    const baseVolume = input.targetMonthlyVolume as number;
    const scenarios = [
      { label: "Conservative", volume: Math.round(baseVolume * 0.5) },
      { label: "Base", volume: baseVolume },
      { label: "Stretch", volume: Math.round(baseVolume * 1.5) },
    ];
    revSlide.addChart(
      pptx.ChartType.bar,
      [{ name: "Monthly revenue ($)", labels: scenarios.map((s) => `${s.label}\n(${s.volume}/mo)`), values: scenarios.map((s) => Math.round(s.volume * price)) }],
      {
        x: 0.6, y: 1.25, w: 12, h: 3.9, barDir: "col",
        chartColors: [BRAND_HEX.indigo], showLegend: false, showValue: true,
        dataLabelColor: BRAND_HEX.slate, catAxisLabelColor: BRAND_HEX.slate, valAxisLabelColor: BRAND_HEX.slate,
        dataLabelFormatCode: "$#,##0",
      }
    );
    revSlide.addText(input.revenueProjections?.trim() || EMPTY, {
      x: 0.5, y: 5.3, w: 12.3, h: 1.9, fontSize: 11, color: BRAND_HEX.slate, valign: "top", wrap: true,
    });
  } else {
    revSlide.addText(
      (input.revenueProjections?.trim() || EMPTY) + "\n\n(Set a quoted unit price and target monthly volume in Charter to generate a revenue chart.)",
      { x: 0.5, y: 1.3, w: 12.3, h: 5.5, fontSize: 15, color: BRAND_HEX.slate, valign: "top", wrap: true }
    );
  }

  // 9b. Benefits & ROI Projection — a real line chart over 3 years (quarterly points), computed
  // from the same quotedUnitPrice/targetMonthlyVolume/targetMarginPercent/funding-ask data as
  // Unit Economics and The Ask below, not a text description. See lib/businessCaseRoi.ts for
  // the ramp/margin model this is built from. Reuses the same upfront-investment/ROI series
  // already computed for the Executive Summary slide, so both agree exactly.
  const upfrontInvestment = upfrontInvestmentForSummary;
  const roiSeries = summaryRoiSeries;
  const roiSlide = bodySlide(pptx, "Benefits & ROI Projection", "09");
  if (roiSeries) {
    const quarters = roiSeries.filter((pt) => pt.month % 3 === 0);
    roiSlide.addChart(
      pptx.ChartType.line,
      [{ name: "ROI (%)", labels: quarters.map((_, i) => `Q${i + 1}`), values: quarters.map((q) => q.roiPercent) }],
      {
        x: 0.6, y: 1.25, w: 12, h: 3.6,
        chartColors: [BRAND_HEX.indigo], showLegend: false, lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 5,
        catAxisLabelColor: BRAND_HEX.slate, valAxisLabelColor: BRAND_HEX.slate, valAxisLabelFormatCode: "0\"%\"",
      }
    );
    const yearRows: [string, string][] = [12, 24, 36]
      .filter((m) => m <= roiSeries.length)
      .map((m) => {
        const pt = roiSeries[m - 1];
        return [`Year ${m / 12}`, `${money(pt.cumulativeNetBenefit)} net benefit  ·  ${pt.roiPercent}% ROI`];
      });
    const yearHeader = [
      { text: "Milestone", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12 } },
      { text: "Cumulative net benefit & ROI", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12 } },
    ];
    const yearBody: TableRow[] = yearRows.map(([label, value]) => [
      { text: label, options: { fontSize: 12, color: BRAND_HEX.slate } },
      { text: value, options: { fontSize: 12, color: BRAND_HEX.navy, bold: true } },
    ]);
    roiSlide.addTable([yearHeader, ...yearBody], {
      x: 0.6, y: 5.1, w: 12, colW: [3, 9], fontSize: 12,
      border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
      rowH: 0.45,
    });
    roiSlide.addText(
      `Ramps linearly to target monthly volume over the first 6 months, then holds. Net benefit = monthly revenue at the ${input.targetMarginPercent}% target margin, against a ${money(upfrontInvestment as number)} upfront investment.`,
      { x: 0.6, y: 6.75, w: 12, h: 0.5, fontSize: 10, color: BRAND_HEX.muted, italic: true }
    );
  } else {
    roiSlide.addText(
      "Set quoted unit price, target monthly volume, and target margin in Charter, plus a funding figure, to generate a benefits/ROI projection.",
      { x: 0.5, y: 1.3, w: 12.3, h: 1, fontSize: 15, color: BRAND_HEX.slate }
    );
  }

  // 10. Roadmap — visual timeline of up to 5 sequenced steps
  const roadmapSlide = bodySlide(pptx, "Roadmap", "10");
  const steps = extractRoadmapSteps(input.businessRoadmap).slice(0, 5);
  if (steps.length) {
    const n = steps.length;
    const trackY = 3.4;
    roadmapSlide.addShape(pptx.ShapeType.line, { x: 0.9, y: trackY, w: 11.5, h: 0, line: { color: BRAND_HEX.border, width: 2 } });
    steps.forEach((step, i) => {
      const cx = 0.9 + (n === 1 ? 5.75 : (11.5 * i) / (n - 1));
      roadmapSlide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.22, y: trackY - 0.22, w: 0.44, h: 0.44, fill: { color: BRAND_HEX.indigo }, line: { color: BRAND_HEX.white, width: 2 } });
      roadmapSlide.addText(String(i + 1), { x: cx - 0.22, y: trackY - 0.22, w: 0.44, h: 0.44, fontSize: 13, bold: true, color: BRAND_HEX.white, align: "center", valign: "middle" });
      const boxW = 11.5 / n - 0.3;
      const boxX = Math.min(Math.max(cx - boxW / 2, 0.5), 12.8 - boxW);
      const below = i % 2 === 0;
      roadmapSlide.addText(step, {
        x: boxX, y: below ? trackY + 0.4 : trackY - 2.1, w: boxW, h: 1.7,
        fontSize: 10.5, color: BRAND_HEX.slate, valign: below ? "top" : "bottom", wrap: true, align: "center",
      });
    });
  } else {
    roadmapSlide.addText(EMPTY, { x: 0.5, y: 1.3, w: 12.3, h: 5.5, fontSize: 15, color: BRAND_HEX.slate, valign: "top" });
  }

  // 11. The Ask — implementation budget breakdown + contingency + total funding required
  const askSlide = bodySlide(pptx, "The Ask", "11 · What We Need To Move Forward");
  const implTotal = input.implementationItems.reduce((s, i) => s + i.amount, 0);
  const askRoi3yr = roiSeries?.[roiSeries.length - 1] ?? null;
  const askBreakEvenMonth = roiSeries?.find((pt) => pt.cumulativeNetBenefit >= 0)?.month ?? null;
  let askTableY = 1.3;
  if (upfrontInvestment != null && askRoi3yr) {
    askSlide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.3, w: 12.3, h: 1.05, fill: { color: BRAND_HEX.indigo }, line: { color: BRAND_HEX.indigo, width: 0 }, rectRadius: 0.08 });
    askSlide.addText(
      [
        { text: `Invest ${money(upfrontInvestment)}`, options: { fontSize: 20, bold: true, color: BRAND_HEX.white } },
        { text: "   →   ", options: { fontSize: 20, color: BRAND_HEX.indigoLight } },
        { text: `${askRoi3yr.roiPercent}% ROI within 3 years`, options: { fontSize: 20, bold: true, color: BRAND_HEX.white } },
      ],
      { x: 0.75, y: 1.45, w: 11.8, h: 0.5, valign: "middle" }
    );
    askSlide.addText(
      askBreakEvenMonth != null ? `Breaks even around month ${askBreakEvenMonth}.` : "Doesn't break even within 3 years at current assumptions.",
      { x: 0.75, y: 1.95, w: 11.8, h: 0.3, fontSize: 11, color: BRAND_HEX.indigoLight }
    );
    askTableY = 2.65;
  }
  if (input.implementationItems.length || input.totalFundingRequired != null) {
    const askHeader = [
      { text: "Use of funds", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12 } },
      { text: "Amount", options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 12, align: "right" as const } },
    ];
    const askRows: TableRow[] = input.implementationItems.map((item) => [
      { text: item.name, options: { fontSize: 11.5, color: BRAND_HEX.slate } },
      { text: money(item.amount), options: { fontSize: 11.5, color: BRAND_HEX.navy, align: "right" } },
    ]);
    if (input.contingencyPercent != null) {
      const contingencyAmount = Math.round(implTotal * (input.contingencyPercent / 100));
      askRows.push([
        { text: `Contingency (${input.contingencyPercent}%)`, options: { fontSize: 11.5, color: BRAND_HEX.slate } },
        { text: money(contingencyAmount), options: { fontSize: 11.5, color: BRAND_HEX.navy, align: "right" } },
      ]);
    }
    askRows.push([
      { text: "Total funding required", options: { fontSize: 12.5, bold: true, color: BRAND_HEX.navy } },
      {
        text: upfrontInvestment != null ? money(upfrontInvestment) : EMPTY,
        options: { fontSize: 12.5, bold: true, color: BRAND_HEX.indigo, align: "right" },
      },
    ]);
    askSlide.addTable([askHeader, ...askRows], {
      x: 0.5, y: askTableY, w: 12.3, colW: [8, 4.3], fontSize: 11.5,
      border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
      rowH: 0.5,
    });
  } else {
    askSlide.addText("No implementation budget captured yet — add cost items in Charter's Cost Summary.", {
      x: 0.5, y: askTableY, w: 12.3, h: 1, fontSize: 14, color: BRAND_HEX.slate,
    });
  }

  // 12. Close
  const closeSlide = executaSlide(pptx);
  closeSlide.addText("Thank You", { x: 0.5, y: 3.0, w: 12.3, h: 1.0, fontSize: 34, bold: true, color: BRAND_HEX.navy, align: "center" });
  closeSlide.addText(input.projectName, { x: 0.5, y: 3.9, w: 12.3, h: 0.6, fontSize: 16, color: BRAND_HEX.slate, align: "center" });

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}
