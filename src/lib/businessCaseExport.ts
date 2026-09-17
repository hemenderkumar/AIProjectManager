import type PptxGenJS from "pptxgenjs";
import { BRAND_HEX, setupExecutaPptx, titleSlide, executaSlide } from "./brand";
import { computeUpfrontInvestment, computeRoiSeries } from "./businessCaseRoi";
import { extractRoadmapSteps } from "./businessCaseRoadmap";

type TableRow = PptxGenJS.TableRow;

export type BusinessCaseInput = {
  projectName: string;
  businessCaseExecutiveSummary: string | null;
  problemStatement: string | null;
  proposedSolution: string | null;
  expectedBenefits: string | null;
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
  buildInfrastructureNeeds: string | null;
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
// Used only where a missing value is a single data point inside an otherwise-full slide (e.g.
// one empty SWOT quadrant) -- EMPTY's bare dash is fine there. For slides where the AI-drafted
// field IS the entire slide body (Executive Summary, Competitive Differentiation), falling back
// to EMPTY leaves a near-blank page that looks like a rendering bug rather than an unfinished
// draft. NOT_DRAFTED makes that unambiguous to the PM reviewing the export before it goes to an
// investor, without ever putting "not yet drafted" language in front of the investor themselves
// (the PM catches it here, in their own export, before sending it on).
const NOT_DRAFTED = (fieldLabel: string) =>
  `Not yet drafted. Fill in "${fieldLabel}" on the Financial Forecast & Projections tab (or use Draft with AI) before sharing this deck.`;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Splits a free-text field into clean bullet lines for card layouts. Same tolerant shape as
// every other free-text field in this app (a PM or the AI draft may write "- item", "* item",
// "1. item", or one item per line with nothing in front) so this works generically for any
// idea's expectedBenefits/proposedSolution, not just ones that happen to use "- " bullets.
function splitBullets(text: string | null | undefined, max = 6): string[] {
  if (!text?.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^[\s]*[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

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
// Auto-built entirely from what the Idea/Ideation workflow already captured -- problemStatement
// and proposedSolution/expectedBenefits from Idea & Alignment, feasibilityScore/recommendedTechnology/
// buildInfrastructureNeeds from Feasibility & Architecture, quotedUnitPrice/targetMonthlyVolume/
// implementationItems from Charter, and the AI-drafted narrative fields (see businessCaseDraft.ts,
// self-healed on export by the API route if any are still missing) -- so this deck is never a
// document someone has to separately author; it falls out of the idea's own workflow.
// Structured like a real investor pitch deck (title, executive summary, agenda, opportunity,
// solution, solution & benefits, SWOT, market analysis + quantified TAM/SAM/SOM sizing (now a
// native bar chart), competitive differentiation, approach & infrastructure, unit economics
// (with a cost/margin donut), revenue chart, benefits/ROI chart, roadmap timeline, an Ask slide
// that leads with "invest $X -> Y% ROI" (with a use-of-funds donut when there's enough line
// items to make one meaningful), close) rather than one slide per text field, so it's something
// a PM can actually take to an investor or funding committee, not just a screen-for-screen dump
// of the tab. Every number on the Executive Summary / Unit Economics / Revenue / ROI / Ask
// slides is computed here from the project's own quotedUnitPrice/targetMonthlyVolume/cost-item
// data — never invented — same discipline as
// the AI draft endpoint that fills the narrative fields. Market sizing (TAM/SAM/SOM) is the one
// exception worth calling out: those are PM-entered numbers, never AI-guessed.
export async function generateBusinessCasePptx(input: BusinessCaseInput): Promise<Buffer> {
  const pptx = setupExecutaPptx("Financial Forecast & Projections");

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
  const hasExecSummary = !!input.businessCaseExecutiveSummary?.trim();
  execSlide.addText(hasExecSummary ? input.businessCaseExecutiveSummary!.trim() : NOT_DRAFTED("Executive summary"), {
    x: 0.85, y: 1.25, w: 11.9, h: 3.0,
    fontSize: hasExecSummary ? 17 : 13,
    italic: !hasExecSummary,
    color: hasExecSummary ? BRAND_HEX.navy : BRAND_HEX.muted,
    valign: "top", wrap: true, lineSpacing: 24,
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
    "The Opportunity", "Our Solution", "Solution & Benefits", "SWOT Analysis", "Market Analysis & Outlook",
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

  // 3. The Opportunity (Problem) — pull-quote styling (accent bar, larger type) so the problem
  // reads as a deliberate opening statement rather than a plain paragraph, with a feasibility
  // stat callout alongside if the idea's been scored.
  const oppSlide = bodySlide(pptx, "The Opportunity", "01 · The Problem");
  const oppTextW = input.feasibilityScore != null ? 8.0 : 11.8;
  oppSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.35, w: 0.06, h: 3.5, fill: { color: BRAND_HEX.red }, line: { color: BRAND_HEX.red, width: 0 } });
  oppSlide.addText(input.problemStatement?.trim() || EMPTY, {
    x: 0.85, y: 1.35, w: oppTextW, h: 3.5, fontSize: 18, color: BRAND_HEX.navy, valign: "top", wrap: true, lineSpacing: 26,
  });
  if (input.feasibilityScore != null) {
    oppSlide.addShape(pptx.ShapeType.roundRect, { x: 9.4, y: 1.35, w: 3.4, h: 2.0, fill: { color: "EEF2FF" }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.08 });
    oppSlide.addText(`${input.feasibilityScore}`, { x: 9.4, y: 1.55, w: 3.4, h: 1.0, fontSize: 40, bold: true, color: BRAND_HEX.indigo, align: "center" });
    oppSlide.addText("/ 100 feasibility score", { x: 9.4, y: 2.6, w: 3.4, h: 0.5, fontSize: 11, color: BRAND_HEX.slate, align: "center" });
  }

  // 4. Our Solution / Business Case
  const solutionSlide = bodySlide(pptx, "Our Solution", "02 · The Business Case");
  solutionSlide.addText(input.businessCase?.trim() || EMPTY, {
    x: 0.5, y: 1.3, w: 12.3, h: 5.2, fontSize: 16, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });

  // 4b. Solution & Benefits — pulls straight from the Idea & Alignment stage (proposedSolution,
  // expectedBenefits), fields the deck never used before. Answers "what does this actually help
  // with" as a visual benefit-card grid rather than another paragraph, and works for any idea —
  // not just this one — since it's driven entirely by whatever the PM captured up front.
  const benefitsSlide = bodySlide(pptx, "Solution & Benefits", "03 · What This Solves");
  const hasSolutionText = !!input.proposedSolution?.trim();
  benefitsSlide.addText(hasSolutionText ? input.proposedSolution!.trim() : NOT_DRAFTED("Proposed solution (Idea & Alignment)"), {
    x: 0.5, y: 1.25, w: 12.3, h: hasSolutionText ? 1.0 : 0.6,
    fontSize: 14, italic: !hasSolutionText,
    color: hasSolutionText ? BRAND_HEX.slate : BRAND_HEX.muted,
    valign: "top", wrap: true,
  });
  const benefitCards = splitBullets(input.expectedBenefits);
  if (benefitCards.length) {
    const cols = 2;
    const cardW = 6.0;
    const cardH = benefitCards.length <= 4 ? 1.4 : 1.0;
    const startY = 2.5;
    benefitCards.forEach((benefit, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.5 + col * (cardW + 0.3);
      const y = startY + row * (cardH + 0.25);
      benefitsSlide.addShape(pptx.ShapeType.roundRect, { x, y, w: cardW, h: cardH, fill: { color: "ECFDF5" }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.06 });
      benefitsSlide.addShape(pptx.ShapeType.ellipse, { x: x + 0.2, y: y + 0.2, w: 0.34, h: 0.34, fill: { color: BRAND_HEX.green }, line: { color: BRAND_HEX.green, width: 0 } });
      benefitsSlide.addText("✓", { x: x + 0.2, y: y + 0.2, w: 0.34, h: 0.34, fontSize: 14, bold: true, color: BRAND_HEX.white, align: "center", valign: "middle" });
      benefitsSlide.addText(benefit, { x: x + 0.68, y: y + 0.12, w: cardW - 0.9, h: cardH - 0.24, fontSize: 12.5, color: "065F46", valign: "middle", wrap: true });
    });
  } else {
    benefitsSlide.addText(NOT_DRAFTED("Expected benefits (Idea & Alignment)"), {
      x: 0.5, y: 2.5, w: 12.3, h: 0.6, fontSize: 13, italic: true, color: BRAND_HEX.muted, valign: "top", wrap: true,
    });
  }

  // 5. SWOT — 2x2 grid, each quadrant its own tinted panel with a symbol marker
  const swotSlide = bodySlide(pptx, "SWOT Analysis", "04");
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
  const marketSlide = bodySlide(pptx, "Market Analysis & Outlook", "05");
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
    marketSlide.addText("Market sizing", { x: 0.5, y: 5.15, w: 12.3, h: 0.3, fontSize: 13, bold: true, color: BRAND_HEX.indigo });
    marketSizingRows.forEach((m, i) => {
      const x = 0.5 + i * 4.15;
      marketSlide.addText(`${m.label} · ${m.sub}: ${money(m.value)}/yr`, { x, y: 5.48, w: 3.9, h: 0.3, fontSize: 10, color: BRAND_HEX.slate, bold: true });
    });
    // A real horizontal bar chart instead of hand-drawn rectangles — same TAM/SAM/SOM funnel
    // relationship, now rendered as an actual chart object consistent with the rest of the deck.
    // Data labels are deliberately off: the exact dollar figures are already printed in the
    // "TAM/SAM/SOM · ..." text row directly above, and turning them on here just duplicates
    // those numbers as tiny bar-end labels that wrap onto 2-3 lines and collide with the
    // category axis at this chart's height (the TAM value in particular runs to 10 digits).
    marketSlide.addChart(
      pptx.ChartType.bar,
      [{ name: "Annual market size ($)", labels: marketSizingRows.map((m) => m.label), values: marketSizingRows.map((m) => m.value) }],
      {
        x: 0.4, y: 5.85, w: 12.5, h: 0.95, barDir: "bar",
        chartColors: [BRAND_HEX.indigo], showLegend: false, showValue: false,
        catAxisLabelColor: BRAND_HEX.slate, catAxisLabelFontSize: 10,
        valAxisHidden: true,
        barGapWidthPct: 40,
      }
    );
  }

  // 6b. Competitive Differentiation — direct "why this wins" vs. the realistic alternative,
  // never real named competitors unless the PM supplied one (same discipline as SWOT/market).
  const compSlide = bodySlide(pptx, "Competitive Differentiation", "06");
  const hasCompDiff = !!input.competitiveDifferentiation?.trim();
  compSlide.addText(hasCompDiff ? input.competitiveDifferentiation!.trim() : NOT_DRAFTED("Competitive differentiation"), {
    x: 0.5, y: 1.3, w: 12.3, h: 5.5,
    fontSize: hasCompDiff ? 15 : 13,
    italic: !hasCompDiff,
    color: hasCompDiff ? BRAND_HEX.slate : BRAND_HEX.muted,
    valign: "top", wrap: true,
  });

  // 7. Approach & Technology
  const approachSlide = bodySlide(pptx, "Approach & Technology", "07 · Why This Will Work");
  const hasInfraNeeds = !!input.buildInfrastructureNeeds?.trim();
  approachSlide.addText("Recommended approach", { x: 0.5, y: 1.2, w: 12.3, h: 0.35, fontSize: 15, bold: true, color: BRAND_HEX.indigo });
  approachSlide.addText(input.recommendedTechnology?.trim() || EMPTY, {
    x: 0.5, y: 1.55, w: 12.3, h: 1.05, fontSize: 14, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  approachSlide.addText("Rationale", { x: 0.5, y: 2.7, w: 12.3, h: 0.35, fontSize: 15, bold: true, color: BRAND_HEX.indigo });
  approachSlide.addText(input.technicalRecommendationRationale?.trim() || EMPTY, {
    x: 0.5, y: 3.05, w: 12.3, h: hasInfraNeeds ? 2.5 : 3.75, fontSize: 13, color: BRAND_HEX.slate, valign: "top", wrap: true,
  });
  if (hasInfraNeeds) {
    approachSlide.addText("Infrastructure needs", { x: 0.5, y: 5.65, w: 12.3, h: 0.35, fontSize: 15, bold: true, color: BRAND_HEX.indigo });
    approachSlide.addText(input.buildInfrastructureNeeds!.trim(), {
      x: 0.5, y: 6.0, w: 12.3, h: 0.9, fontSize: 12, color: BRAND_HEX.slate, valign: "top", wrap: true,
    });
  }

  // 9. Unit Economics — clean table
  const priceKnown = input.quotedUnitPrice != null;
  const materialKnown = input.materialCostEstimate != null;
  const volumeKnown = input.targetMonthlyVolume != null;
  const monthlyRevenue = priceKnown && volumeKnown ? (input.quotedUnitPrice as number) * (input.targetMonthlyVolume as number) : null;
  const grossMarginPerUnit = priceKnown && materialKnown ? (input.quotedUnitPrice as number) - (input.materialCostEstimate as number) : null;

  const unitEconSlide = bodySlide(pptx, "Unit Economics", "08");
  const hasCostSplit = priceKnown && materialKnown && grossMarginPerUnit != null && grossMarginPerUnit > 0;
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
  // Table narrows to make room for a cost/margin donut chart when both figures are known —
  // full width otherwise so nothing looks like it's leaving empty space on purpose.
  unitEconSlide.addTable([header, ...body], {
    x: 0.5, y: 1.3, w: hasCostSplit ? 7.4 : 12.3, colW: hasCostSplit ? [4.9, 2.5] : [8, 4.3], fontSize: 12,
    border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
    rowH: 0.55,
  });
  if (hasCostSplit) {
    unitEconSlide.addText("Where each dollar goes", { x: 8.15, y: 1.3, w: 4.65, h: 0.35, fontSize: 12, bold: true, color: BRAND_HEX.indigo });
    unitEconSlide.addChart(
      pptx.ChartType.doughnut,
      [{ name: "Per unit ($)", labels: ["Material cost", "Gross margin"], values: [input.materialCostEstimate as number, grossMarginPerUnit as number] }],
      {
        x: 8.15, y: 1.7, w: 4.65, h: 3.3,
        chartColors: [BRAND_HEX.muted, BRAND_HEX.indigo],
        showLegend: true, legendPos: "b", legendColor: BRAND_HEX.slate, legendFontSize: 10,
        showValue: true, dataLabelColor: BRAND_HEX.white, dataLabelFontSize: 10, dataLabelFormatCode: "$#,##0",
        showPercent: false,
      }
    );
  }

  // 10. Revenue Projections — native chart (Conservative / Base / Stretch), computed from
  // quotedUnitPrice x volume, never parsed out of free text.
  const revSlide = bodySlide(pptx, "Revenue Projections", "09");
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
        x: 0.6, y: 1.2, w: 12, h: 3.5, barDir: "col",
        chartColors: [BRAND_HEX.indigo], showLegend: false, showValue: true,
        dataLabelColor: BRAND_HEX.slate, catAxisLabelColor: BRAND_HEX.slate, valAxisLabelColor: BRAND_HEX.slate,
        dataLabelFormatCode: "$#,##0",
      }
    );
    revSlide.addText(input.revenueProjections?.trim() || EMPTY, {
      x: 0.5, y: 4.85, w: 12.3, h: 1.95, fontSize: 11, color: BRAND_HEX.slate, valign: "top", wrap: true,
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
  const roiSlide = bodySlide(pptx, "Benefits & ROI Projection", "10");
  if (roiSeries) {
    const quarters = roiSeries.filter((pt) => pt.month % 3 === 0);
    roiSlide.addChart(
      pptx.ChartType.line,
      [{ name: "ROI (%)", labels: quarters.map((_, i) => `Q${i + 1}`), values: quarters.map((q) => q.roiPercent) }],
      {
        x: 0.6, y: 1.15, w: 12, h: 3.2,
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
      x: 0.6, y: 4.5, w: 12, colW: [3, 9], fontSize: 12,
      border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
      rowH: 0.4,
    });
    roiSlide.addText(
      `Ramps linearly to target monthly volume over the first 6 months, then holds. Net benefit = monthly revenue at the ${input.targetMarginPercent}% target margin, against a ${money(upfrontInvestment as number)} upfront investment.`,
      { x: 0.6, y: 6.35, w: 12, h: 0.55, fontSize: 10, color: BRAND_HEX.muted, italic: true }
    );
  } else {
    roiSlide.addText(
      "Set quoted unit price, target monthly volume, and target margin in Charter, plus a funding figure, to generate a benefits/ROI projection.",
      { x: 0.5, y: 1.3, w: 12.3, h: 1, fontSize: 15, color: BRAND_HEX.slate }
    );
  }

  // 11. Roadmap — visual timeline of up to 5 sequenced steps
  const roadmapSlide = bodySlide(pptx, "Roadmap", "11");
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

  // 12. The Ask — implementation budget breakdown + contingency + total funding required
  const askSlide = bodySlide(pptx, "The Ask", "12 · What We Need To Move Forward");
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
    // A donut breakdown of use-of-funds only earns its space when there are enough distinct
    // line items to actually show a split -- one or two items next to a contingency line would
    // just be a circle with one dominant slice, not a useful chart.
    const showFundsChart = input.implementationItems.length >= 3;
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
      x: 0.5, y: askTableY, w: showFundsChart ? 7.4 : 12.3, colW: showFundsChart ? [5.4, 2] : [8, 4.3], fontSize: 11.5,
      border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
      rowH: 0.5,
    });
    if (showFundsChart) {
      const chartColors = [BRAND_HEX.indigo, BRAND_HEX.indigoDark, BRAND_HEX.indigoLight, BRAND_HEX.muted, "818CF8"];
      askSlide.addText("Use of funds", { x: 8.15, y: askTableY, w: 4.65, h: 0.35, fontSize: 12, bold: true, color: BRAND_HEX.indigo });
      askSlide.addChart(
        pptx.ChartType.doughnut,
        [{ name: "Amount ($)", labels: input.implementationItems.map((i) => i.name), values: input.implementationItems.map((i) => i.amount) }],
        {
          x: 8.15, y: askTableY + 0.4, w: 4.65, h: 3.2,
          chartColors,
          showLegend: true, legendPos: "b", legendColor: BRAND_HEX.slate, legendFontSize: 8,
          showPercent: true, dataLabelColor: BRAND_HEX.white, dataLabelFontSize: 9,
        }
      );
    }
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
