// The Idea Evaluation deck, in the Executa pitch-deck style (navy + amber, serif headings,
// stat cards). Built from whatever the idea already has: any slide with nothing real to say is
// left out rather than shown with placeholders, so the deck never looks unfinished.
import PptxGenJS from "pptxgenjs";
import fs from "fs";
import path from "path";
import type { IdeaCostSummary, IdeaResearchData } from "./ideaEvaluation";
import { stripCitations } from "./ideaEvaluation";
import { extractRoadmapSteps } from "./businessCaseRoadmap";

const C = {
  navy: "1E2761", navyDeep: "151C4A", blue: "3B5BA5", amber: "F2A33A", ice: "CADCFC",
  panel: "EEF2FB", ink: "1F2937", slate: "475569", muted: "8A94A6", white: "FFFFFF",
  green: "E7F5EC", greenInk: "1E7B45", red: "FDECEC", redInk: "B3261E", sand: "FFF4E0", sandInk: "A15C00", blueTint: "E6EEFB",
};
const HEAD = "Cambria";
const BODY = "Calibri";

export type IdeaDeckInput = {
  name: string;
  problem: string | null;
  solution: string | null;
  benefits: string | null;
  executiveSummary: string | null;
  feasibilityScore: number | null;
  recommendedTechnology: string | null;
  feasibilityNotes: string | null;
  infrastructure: string | null;
  marketAnalysis: string | null;
  competitiveDifferentiation: string | null;
  swot: { strengths: string | null; weaknesses: string | null; opportunities: string | null; threats: string | null };
  roadmap: string | null;
  research: IdeaResearchData | null;
  cost: IdeaCostSummary | null;
  ask: { decision: string | null; team: string | null; timeline: string | null; ifApproved: string | null; ifDeclined: string | null; funding: number | null };
  generatedAt: Date;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const compact = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : money(n));
const has = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;
const clean = (s: string) => stripCitations(s).replace(/\s+/g, " ").trim();

// Shortens to a whole sentence (or word) boundary so nothing is cut mid-word.
export function clip(text: string | null | undefined, max: number): string {
  const t = clean(text ?? "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}
export function bullets(text: string | null | undefined, max = 5, each = 150): string[] {
  if (!has(text)) return [];
  const lines = text.split("\n").map((l) => clean(l.replace(/^[\s]*[-*•]\s*/, "").replace(/^\d+[.)]\s*/, ""))).filter(Boolean);
  const parts = lines.length > 1 ? lines : clean(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, max).map((l) => clip(l, each));
}
function firstSentence(t: string | null | undefined, max = 150): string {
  const c = clean(t ?? "");
  const m = c.match(/^.*?[.!?](\s|$)/);
  return clip(m ? m[0] : c, max);
}

let logoCache: string | null | undefined;
function logoData(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = `image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "executa-mark.png")).toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

export async function generateIdeaDeck(i: IdeaDeckInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "EXECUTA_WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "EXECUTA_WIDE";
  pptx.title = `${i.name} — Idea evaluation`;
  pptx.author = "Executa";
  let page = 0;

  function shell(title: string, subtitle: string | undefined, section: string, dark = false) {
    const s = pptx.addSlide();
    page += 1;
    s.background = { color: dark ? C.navy : C.white };
    s.addText(title, { x: 0.6, y: 0.4, w: 12.1, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: dark ? C.white : C.ink, margin: 0, valign: "middle" });
    if (subtitle) s.addText(subtitle, { x: 0.6, y: 1.1, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 14, color: dark ? C.ice : C.slate, margin: 0, valign: "top" });
    s.addText(`${i.name}  —  Confidential  |  ${section}`, { x: 0.6, y: 7.05, w: 10, h: 0.3, fontFace: BODY, fontSize: 9, color: dark ? C.ice : C.muted, margin: 0 });
    s.addText(String(page), { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 9, color: dark ? C.ice : C.muted, align: "right", margin: 0 });
    return s;
  }
  const card = (s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, fill = C.panel) =>
    s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.08 });
  const badge = (s: PptxGenJS.Slide, x: number, y: number, label: string, fill = C.navy, color = C.white) => {
    s.addShape(pptx.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color: fill }, line: { color: fill, width: 0 } });
    s.addText(label, { x, y, w: 0.42, h: 0.42, fontFace: BODY, fontSize: 12, bold: true, color, align: "center", valign: "middle", margin: 0 });
  };
  const stat = (s: PptxGenJS.Slide, x: number, y: number, w: number, big: string, label: string, dark = false) => {
    card(s, x, y, w, 1.3, dark ? C.navyDeep : C.blueTint);
    s.addText(big, { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: dark ? C.amber : C.navy, margin: 0, valign: "middle" });
    s.addText(label, { x: x + 0.2, y: y + 0.82, w: w - 0.4, h: 0.4, fontFace: BODY, fontSize: 11, color: dark ? C.ice : C.slate, margin: 0, valign: "top" });
  };

  const research = i.research && has(i.research.summary) ? i.research : null;
  const cost = i.cost && i.cost.firstYearTotal > 0 ? i.cost : null;
  const funding = i.ask.funding && i.ask.funding > 0 ? i.ask.funding : null;

  // 1. Title ---------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page += 1;
    s.background = { color: C.navy };
    s.addShape(pptx.ShapeType.ellipse, { x: 9.6, y: 4.1, w: 5.2, h: 5.2, fill: { color: C.navyDeep }, line: { color: C.navyDeep, width: 0 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 11.2, y: 5.6, w: 2.6, h: 2.6, fill: { color: C.ice }, line: { color: C.ice, width: 0 } });
    const logo = logoData();
    if (logo) s.addImage({ data: logo, x: 0.6, y: 0.55, w: 0.5, h: 0.5 });
    s.addText("EXECUTA", { x: logo ? 1.25 : 0.6, y: 0.55, w: 4, h: 0.5, fontFace: BODY, fontSize: 16, bold: true, color: C.white, charSpacing: 3, margin: 0, valign: "middle" });
    s.addText(i.name, { x: 0.6, y: 2.2, w: 9.6, h: 1.9, fontFace: HEAD, fontSize: 40, bold: true, color: C.white, margin: 0, valign: "top" });
    const tag = firstSentence(i.problem ?? i.solution, 220);
    if (tag) s.addText(tag, { x: 0.6, y: 4.3, w: 8.6, h: 0.9, fontFace: BODY, fontSize: 18, italic: true, color: C.ice, margin: 0, valign: "top" });
    s.addText(`Idea evaluation  ·  Prepared ${i.generatedAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`, { x: 0.6, y: 6.7, w: 8, h: 0.35, fontFace: BODY, fontSize: 11, color: C.ice, margin: 0 });
  }

  // 2. Executive summary ----------------------------------------------------------------
  {
    const s = shell("Executive summary", firstSentence(i.executiveSummary ?? i.solution, 160) || undefined, "Executive summary");
    const stats: [string, string][] = [];
    if (i.feasibilityScore != null) stats.push([`${i.feasibilityScore}/100`, "Feasibility score"]);
    if (cost) stats.push([compact(cost.firstYearTotal), "Estimated first-year cost"]);
    if (funding) stats.push([compact(funding), "Funding requested"]);
    if (research && i.research!.competitors.length) stats.push([String(i.research!.competitors.length), "Competitors analysed"]);
    const shown = stats.slice(0, 4);
    const w = shown.length ? (12.1 - (shown.length - 1) * 0.25) / shown.length : 0;
    shown.forEach(([b, l], idx) => stat(s, 0.6 + idx * (w + 0.25), 1.75, w, b, l));
    const rows: [string, string, string | null][] = [
      ["P", "Problem", has(i.problem) ? clip(i.problem, 230) : null],
      ["S", "Solution", has(i.solution) ? clip(i.solution, 230) : null],
      ["M", "Market", research ? clip(research.positioning || research.summary, 230) : null],
      ["A", "The ask", has(i.ask.decision) ? clip(i.ask.decision, 230) : null],
    ];
    const present = rows.filter((r) => r[2]);
    const top = shown.length ? 3.35 : 1.85;
    const rowH = Math.min(0.95, (6.8 - top) / Math.max(1, present.length));
    present.forEach(([b, t, body], idx) => {
      const y = top + idx * rowH;
      badge(s, 0.6, y + 0.05, b);
      s.addText(t, { x: 1.2, y, w: 2, h: 0.3, fontFace: BODY, fontSize: 13, bold: true, color: C.navy, margin: 0 });
      s.addText(body!, { x: 1.2, y: y + 0.3, w: 11.4, h: rowH - 0.35, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0, valign: "top" });
    });
  }

  // 3. Problem + 4. Solution & benefits ------------------------------------------------
  if (has(i.problem)) {
    const s = shell("The problem", "Why this is worth solving", "The problem");
    card(s, 0.6, 1.8, 7.4, 4.9, C.panel);
    s.addText(clip(i.problem, 520), { x: 0.95, y: 2.1, w: 6.7, h: 4.3, fontFace: HEAD, fontSize: 20, color: C.navy, margin: 0, valign: "top", lineSpacingMultiple: 1.15 });
    const impacts = bullets(i.benefits, 4, 110);
    if (impacts.length) {
      s.addText("WHAT IMPROVES", { x: 8.4, y: 1.8, w: 4.3, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.amber, charSpacing: 2, margin: 0 });
      const h = Math.min(1.1, 4.5 / impacts.length);
      impacts.forEach((t, idx) => {
        const y = 2.25 + idx * (h + 0.1);
        card(s, 8.4, y, 4.3, h, C.blueTint);
        s.addText(t, { x: 8.6, y, w: 3.9, h, fontFace: BODY, fontSize: 12, color: C.ink, margin: 0, valign: "middle" });
      });
    }
  }
  if (has(i.solution)) {
    const s = shell("Proposed solution", "What we would build and how it creates value", "Solution");
    card(s, 0.6, 1.8, 12.1, 2.1, C.navy);
    s.addText(clip(i.solution, 420), { x: 0.9, y: 1.9, w: 11.5, h: 1.9, fontFace: HEAD, fontSize: 18, color: C.white, margin: 0, valign: "middle" });
    const pts = bullets(i.benefits, 3, 130);
    if (pts.length) {
      const w = (12.1 - (pts.length - 1) * 0.25) / pts.length;
      pts.forEach((t, idx) => {
        const x = 0.6 + idx * (w + 0.25);
        card(s, x, 4.2, w, 2.4, C.panel);
        badge(s, x + 0.25, 4.45, String(idx + 1), C.amber, C.navy);
        s.addText(t, { x: x + 0.25, y: 5.0, w: w - 0.5, h: 1.5, fontFace: BODY, fontSize: 13, color: C.ink, margin: 0, valign: "top" });
      });
    }
  }

  // 5. Market research -----------------------------------------------------------------
  if (research) {
    const r = i.research!;
    const s = shell("Market opportunity", r.webSearched ? "AI-assisted research with cited sources" : "AI-assisted research from general knowledge — verify figures before relying on them", "Market");
    card(s, 0.6, 1.8, 5.6, 2.3, C.navy);
    s.addText(r.marketSize ? "MARKET SIZE" : "OVERVIEW", { x: 0.9, y: 1.95, w: 5, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.amber, charSpacing: 2, margin: 0 });
    s.addText(clip(r.marketSize || r.summary, 230), { x: 0.9, y: 2.3, w: 5.0, h: 1.7, fontFace: HEAD, fontSize: 15, color: C.white, margin: 0, valign: "top" });
    const left = clip(r.marketSize ? r.summary : r.positioning, 330);
    if (left) s.addText(left, { x: 0.6, y: 4.3, w: 5.6, h: 2.3, fontFace: BODY, fontSize: 12.5, color: C.slate, margin: 0, valign: "top" });
    if (r.competitors.length) {
      s.addText("COMPETITIVE LANDSCAPE", { x: 6.6, y: 1.8, w: 6, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.amber, charSpacing: 2, margin: 0 });
      const comps = r.competitors.slice(0, 5);
      const h = Math.min(0.92, 4.5 / comps.length);
      comps.forEach((c, idx) => {
        const y = 2.2 + idx * (h + 0.08);
        card(s, 6.6, y, 6.1, h, C.panel);
        s.addText(c.name, { x: 6.8, y, w: 1.9, h, fontFace: BODY, fontSize: 12, bold: true, color: C.navy, margin: 0, valign: "middle" });
        s.addText(clip(c.what + (c.pricing ? ` (${c.pricing})` : ""), 120), { x: 8.7, y, w: 3.9, h, fontFace: BODY, fontSize: 10.5, color: C.slate, margin: 0, valign: "middle" });
      });
    }
    const src = r.sources.slice(0, 4).map((x) => { try { return new URL(x.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
    if (src.length) s.addText(`Sources: ${src.join(", ")}`, { x: 0.6, y: 6.7, w: 12.1, h: 0.28, fontFace: BODY, fontSize: 9, italic: true, color: C.muted, margin: 0 });
  }

  // 6. Positioning & risks --------------------------------------------------------------
  {
    const cols: [string, string, string[]][] = [];
    const pos = clip(research?.positioning || "", 260);
    if (pos) cols.push(["Where we fit", C.navy, [pos]]);
    const diff = bullets(i.competitiveDifferentiation, 4, 130);
    if (diff.length) cols.push(["Why we win", C.blue, diff]);
    const risks = research?.risks.slice(0, 4).map((r) => clip(r, 130)) ?? [];
    if (risks.length) cols.push(["Market risks", C.amber, risks]);
    if (cols.length >= 2) {
      const s = shell("Positioning & risks", "How this idea stands against the market", "Positioning");
      const w = (12.1 - (cols.length - 1) * 0.3) / cols.length;
      cols.forEach(([title, color, items], idx) => {
        const x = 0.6 + idx * (w + 0.3);
        s.addShape(pptx.ShapeType.roundRect, { x, y: 1.8, w, h: 4.9, fill: { color }, line: { color, width: 0 }, rectRadius: 0.08 });
        s.addText(title, { x: x + 0.3, y: 2.0, w: w - 0.6, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: color === C.amber ? C.navy : C.white, margin: 0 });
        s.addText(items.map((t, k) => ({ text: t, options: { bullet: items.length > 1, breakLine: k < items.length - 1, paraSpaceAfter: 8 } })), {
          x: x + 0.3, y: 2.6, w: w - 0.6, h: 3.9, fontFace: BODY, fontSize: 15, color: color === C.amber ? C.navy : C.white, margin: 0, valign: "top",
        });
      });
    }
  }

  // 7. Feasibility ---------------------------------------------------------------------
  if (i.feasibilityScore != null || has(i.recommendedTechnology) || has(i.feasibilityNotes)) {
    const s = shell("Feasibility & approach", "Can it be done with the people, technology and materials available?", "Feasibility");
    if (i.feasibilityScore != null) {
      card(s, 0.6, 1.8, 3.6, 4.9, C.navy);
      s.addText(String(i.feasibilityScore), { x: 0.6, y: 2.3, w: 3.6, h: 1.5, fontFace: HEAD, fontSize: 72, bold: true, color: C.amber, align: "center", margin: 0 });
      s.addText("out of 100", { x: 0.6, y: 3.8, w: 3.6, h: 0.4, fontFace: BODY, fontSize: 14, color: C.ice, align: "center", margin: 0 });
      s.addText("FEASIBILITY SCORE", { x: 0.6, y: 4.4, w: 3.6, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.ice, align: "center", charSpacing: 2, margin: 0 });
    }
    const blocks: [string, string][] = [];
    if (has(i.recommendedTechnology)) blocks.push(["Recommended approach", clip(i.recommendedTechnology, 300)]);
    if (has(i.infrastructure)) blocks.push(["Infrastructure & materials", clip(i.infrastructure, 260)]);
    if (has(i.feasibilityNotes)) blocks.push(["Key considerations", clip(i.feasibilityNotes, 300)]);
    const x0 = i.feasibilityScore != null ? 4.5 : 0.6;
    const w = i.feasibilityScore != null ? 8.2 : 12.1;
    const h = (4.9 - (blocks.length - 1) * 0.2) / Math.max(1, blocks.length);
    blocks.forEach(([t, body], idx) => {
      const y = 1.8 + idx * (h + 0.2);
      card(s, x0, y, w, h, C.panel);
      s.addText(t.toUpperCase(), { x: x0 + 0.3, y: y + 0.12, w: w - 0.6, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.blue, charSpacing: 2, margin: 0 });
      s.addText(body, { x: x0 + 0.3, y: y + 0.45, w: w - 0.6, h: h - 0.55, fontFace: BODY, fontSize: 15, color: C.ink, margin: 0, valign: "top" });
    });
  }

  // 8. Total cost -----------------------------------------------------------------------
  if (cost) {
    const s = shell("Total cost", "What it takes to build and to run", "Cost");
    const stats: [string, string][] = [[compact(cost.oneTimeTotal), "One-time investment"], [compact(cost.ongoingAnnual), "Ongoing support / year"], [compact(cost.firstYearTotal), "First-year total"]];
    stats.forEach(([b, l], idx) => stat(s, 0.6 + idx * 2.75, 1.75, 2.5, b, l, idx === 2));
    const rows: [string, number, boolean?][] = [["Materials", cost.materials], ["Labour", cost.labor], ["Implementation", cost.implementation]];
    if (cost.licenses > 0) rows.push(["  incl. licences & subscriptions", cost.licenses, true]);
    rows.push(["Contingency", cost.contingency], ["One-time total", cost.oneTimeTotal], ["Ongoing support (per year)", cost.ongoingAnnual], ["First-year total", cost.firstYearTotal]);
    const tbl = rows.map(([l, v, sub]) => {
      const strong = l === "One-time total" || l === "First-year total";
      return [
        { text: l, options: { fontFace: BODY, fontSize: 12, bold: strong, color: sub ? C.muted : strong ? C.navy : C.slate, fill: { color: strong ? C.blueTint : C.white } } },
        { text: money(v), options: { fontFace: BODY, fontSize: 12, bold: strong, color: sub ? C.muted : strong ? C.navy : C.slate, align: "right" as const, fill: { color: strong ? C.blueTint : C.white } } },
      ];
    });
    s.addTable(tbl, { x: 0.6, y: 3.3, w: 8.0, colW: [5.6, 2.4], rowH: 0.36, border: { type: "solid", color: "DDE3F0", pt: 0.5 } });
    const slices: [string, number][] = [["Materials", cost.materials], ["Labour", cost.labor], ["Implementation", cost.implementation], ["Contingency", cost.contingency], ["Ongoing (1 yr)", cost.ongoingAnnual]];
    const nz = slices.filter(([, v]) => v > 0);
    if (nz.length >= 2) {
      s.addChart(pptx.ChartType.doughnut, [{ name: "Cost", labels: nz.map(([l]) => l), values: nz.map(([, v]) => Math.round(v)) }], {
        x: 8.9, y: 1.7, w: 3.9, h: 5.0, holeSize: 55,
        chartColors: [C.navy, C.amber, C.blue, C.ice, C.muted], showLegend: true, legendPos: "b", legendFontSize: 10, legendColor: C.slate,
        showPercent: true, showValue: false, dataLabelColor: C.white, dataLabelFontSize: 10,
      });
    }
  }

  // 9. SWOT -------------------------------------------------------------------------------
  {
    const q: [string, string | null, string, string, string][] = [
      ["Strengths", i.swot.strengths, C.green, C.greenInk, "+"], ["Weaknesses", i.swot.weaknesses, C.red, C.redInk, "−"],
      ["Opportunities", i.swot.opportunities, C.blueTint, C.blue, "↗"], ["Threats", i.swot.threats, C.sand, C.sandInk, "!"],
    ];
    if (q.filter((x) => has(x[1])).length >= 2) {
      const s = shell("SWOT analysis", undefined, "SWOT");
      q.forEach(([t, text, fill, ink, glyph], idx) => {
        const x = 0.6 + (idx % 2) * 6.15;
        const y = 1.35 + Math.floor(idx / 2) * 2.8;
        card(s, x, y, 5.95, 2.65, fill);
        badge(s, x + 0.2, y + 0.15, glyph, ink);
        s.addText(t, { x: x + 0.75, y: y + 0.15, w: 4.5, h: 0.42, fontFace: HEAD, fontSize: 16, bold: true, color: ink, margin: 0, valign: "middle" });
        const pts = bullets(text, 4, 120);
        s.addText(pts.length ? pts.map((p, k) => ({ text: p, options: { bullet: true, breakLine: k < pts.length - 1, paraSpaceAfter: 4 } })) : "—", {
          x: x + 0.25, y: y + 0.7, w: 5.45, h: 1.85, fontFace: BODY, fontSize: 11, color: C.ink, margin: 0, valign: "top",
        });
      });
    }
  }

  // 10. Roadmap ---------------------------------------------------------------------------
  {
    const steps = extractRoadmapSteps(i.roadmap).slice(0, 4);
    if (steps.length >= 2) {
      const s = shell("Roadmap", "How we get from decision to delivery", "Roadmap");
      const fills = [C.navy, C.blue, C.amber, C.navyDeep];
      const w = (12.1 - (steps.length - 1) * 0.25) / steps.length;
      steps.forEach((t, idx) => {
        const x = 0.6 + idx * (w + 0.25);
        const fill = fills[idx % fills.length];
        const ink = fill === C.amber ? C.navy : C.white;
        s.addShape(pptx.ShapeType.roundRect, { x, y: 1.9, w, h: 4.7, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.08 });
        s.addText(`Phase ${idx + 1}`, { x: x + 0.25, y: 2.1, w: w - 0.5, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: ink, margin: 0 });
        s.addText(clip(t, 190), { x: x + 0.25, y: 2.75, w: w - 0.5, h: 3.7, fontFace: BODY, fontSize: 15, color: ink, margin: 0, valign: "top" });
      });
    }
  }

  // 11. The ask ----------------------------------------------------------------------------
  if (has(i.ask.decision)) {
    const s = shell("The ask", "The decision we need", "The ask", true);
    card(s, 0.6, 1.8, funding ? 8.6 : 12.1, 1.9, C.navyDeep);
    s.addText(clip(i.ask.decision, 240), { x: 0.9, y: 1.85, w: funding ? 8.0 : 11.5, h: 1.8, fontFace: HEAD, fontSize: 20, bold: true, color: C.white, margin: 0, valign: "middle" });
    if (funding) {
      card(s, 9.5, 1.8, 3.2, 1.9, C.amber);
      s.addText(compact(funding), { x: 9.5, y: 2.0, w: 3.2, h: 0.9, fontFace: HEAD, fontSize: 38, bold: true, color: C.navy, align: "center", margin: 0, valign: "middle" });
      s.addText("FUNDING REQUESTED", { x: 9.5, y: 2.95, w: 3.2, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: C.navy, align: "center", charSpacing: 2, margin: 0 });
    }
    const cards: [string, string | null][] = [["Team & skills", i.ask.team], ["Timeline", i.ask.timeline], ["If approved", i.ask.ifApproved], ["If declined", i.ask.ifDeclined]];
    const pres = cards.filter((c) => has(c[1]));
    const w = (12.1 - 0.3) / 2;
    const h = pres.length > 2 ? 1.4 : 2.0;
    pres.forEach(([t, body], idx) => {
      const x = 0.6 + (idx % 2) * (w + 0.3);
      const y = 4.0 + Math.floor(idx / 2) * (h + 0.2);
      card(s, x, y, w, h, C.blue);
      s.addText(t!.toUpperCase(), { x: x + 0.25, y: y + 0.1, w: w - 0.5, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: C.amber, charSpacing: 2, margin: 0 });
      s.addText(clip(body, 170), { x: x + 0.25, y: y + 0.42, w: w - 0.5, h: h - 0.5, fontFace: BODY, fontSize: 13, color: C.white, margin: 0, valign: "top" });
    });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
