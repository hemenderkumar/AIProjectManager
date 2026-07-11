import type { PortfolioOnePager } from "./portfolioReportData";
import { splitSections } from "./reportExport";
import {
  BRAND,
  BRAND_HEX,
  createKeelPdf,
  finalizeKeelPdf,
  sectionTitle,
  coverMasthead,
  setupKeelPptx,
  titleSlide,
  keelSlide,
} from "./brand";
import { drawPortfolioSnapshotBody } from "./portfolioExport";

/** Turns a plain-text weekly status report / steering committee pack (AI-generated
 * markdown-ish text, stored as one text blob in the `reports` table) into a branded,
 * graphical PDF: a portfolio snapshot page (KPIs, RAG, budget, at-risk — using the live
 * portfolio numbers, same as the Dashboard one-pager) followed by the AI narrative broken
 * into real section headings instead of one wall of text. */
export function generatePortfolioNarrativeReportPdf(
  title: string,
  snapshot: PortfolioOnePager,
  reportText: string,
  generatedAt: Date
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 44 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    coverMasthead(doc, title, `Generated ${generatedAt.toLocaleDateString("en-US")}`);
    drawPortfolioSnapshotBody(doc, snapshot);

    doc.addPage();
    const sections = splitSections(reportText);
    for (const s of sections) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
      if (s.heading) sectionTitle(doc, s.heading);
      if (s.body) doc.font("Helvetica").fontSize(10.5).fillColor(BRAND.slate).text(s.body, { align: "left" });
      doc.moveDown(0.9);
    }

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });
}

export async function generatePortfolioNarrativeReportPptx(
  title: string,
  snapshot: PortfolioOnePager,
  reportText: string,
  generatedAt: Date
): Promise<Buffer> {
  const pptx = setupKeelPptx();

  titleSlide(pptx, title, undefined, generatedAt);

  // Snapshot slide — same numbers as the Dashboard one-pager's native pie/bar charts.
  const snapSlide = keelSlide(pptx);
  snapSlide.addText("Portfolio Snapshot", { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 22, bold: true, color: BRAND_HEX.navy });

  const kpis: { label: string; value: string; color?: string }[] = [
    { label: "Active Projects", value: String(snapshot.activeCount) },
    { label: "Avg % Complete", value: `${snapshot.avgPercentComplete}%` },
    { label: "Overdue Tasks", value: String(snapshot.totalOverdueTasks), color: snapshot.totalOverdueTasks > 0 ? "DC2626" : "059669" },
    { label: "Open High Risks", value: String(snapshot.totalOpenHighRisks), color: snapshot.totalOpenHighRisks > 0 ? "DC2626" : "059669" },
  ];
  const kpiW = 2.9;
  const kpiGap = 0.25;
  kpis.forEach((k, i) => {
    const x = 0.5 + i * (kpiW + kpiGap);
    snapSlide.addShape(pptx.ShapeType.roundRect, { x, y: 0.9, w: kpiW, h: 1.05, fill: { color: BRAND_HEX.panel }, line: { color: BRAND_HEX.border }, rectRadius: 0.06 });
    snapSlide.addText(k.label, { x: x + 0.15, y: 1.0, w: kpiW - 0.3, h: 0.3, fontSize: 11, color: BRAND_HEX.slate });
    snapSlide.addText(k.value, { x: x + 0.15, y: 1.25, w: kpiW - 0.3, h: 0.6, fontSize: 24, bold: true, color: k.color ?? BRAND_HEX.navy });
  });

  snapSlide.addText("Portfolio Health (RAG)", { x: 0.5, y: 2.2, w: 6, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  snapSlide.addChart(
    pptx.ChartType.pie,
    [{ name: "RAG", labels: ["Green", "Yellow", "Red"], values: [snapshot.byRag.GREEN, snapshot.byRag.YELLOW, snapshot.byRag.RED] }],
    { x: 0.5, y: 2.55, w: 3.2, h: 2.5, chartColors: [BRAND_HEX.green, BRAND_HEX.yellow, BRAND_HEX.red], showLegend: true, legendPos: "b" }
  );

  snapSlide.addText("Budget — Planned vs Actual", { x: 4.0, y: 2.2, w: 5, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  snapSlide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Planned", labels: ["Budget"], values: [snapshot.totalBudgetPlanned] },
      { name: "Actual", labels: ["Budget"], values: [snapshot.totalBudgetActual] },
    ],
    { x: 4.0, y: 2.55, w: 4.0, h: 2.5, barDir: "col", chartColors: [BRAND_HEX.indigoLight, BRAND_HEX.indigo], showLegend: true, legendPos: "b", showValue: true }
  );

  snapSlide.addText("Needs Attention", { x: 8.3, y: 2.2, w: 4.5, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  if (snapshot.topAtRisk.length === 0) {
    snapSlide.addText("Nothing flagged — every active project is green.", { x: 8.3, y: 2.6, w: 4.5, h: 0.5, fontSize: 11, color: BRAND_HEX.slate });
  } else {
    const rows = snapshot.topAtRisk.map((p) => [
      { text: p.name, options: { fontSize: 9, bold: true, color: BRAND_HEX.slate } },
      { text: `${p.stage}\n${p.reason}`, options: { fontSize: 8, color: BRAND_HEX.muted } },
    ]);
    snapSlide.addTable(rows, { x: 8.3, y: 2.55, w: 4.5, h: 2.4, fontSize: 9, border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 }, autoPage: false });
  }

  // One slide per narrative section — same treatment as the per-project status report.
  const sections = splitSections(reportText);
  for (const s of sections) {
    const slide = keelSlide(pptx);
    if (s.heading) {
      slide.addText(s.heading, { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 22, bold: true, color: BRAND_HEX.navy });
    }
    slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.0, w: 12.3, h: 0, line: { color: BRAND_HEX.border, width: 1 } });
    slide.addText(s.body || "—", {
      x: 0.5,
      y: 1.2,
      w: 12.3,
      h: 5.6,
      fontSize: 14,
      color: BRAND_HEX.slate,
      valign: "top",
      wrap: true,
    });
  }

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}
