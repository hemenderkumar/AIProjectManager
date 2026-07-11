import type { PortfolioOnePager } from "./portfolioReportData";
import { BRAND, BRAND_HEX, createKeelPdf, finalizeKeelPdf, sectionTitle, coverMasthead, setupKeelPptx, titleSlide, keelSlide } from "./brand";

const RAG_HEX: Record<string, string> = { GREEN: "10b981", YELLOW: "f59e0b", RED: "ef4444" };

/** Draws the KPI cards / RAG bar / budget bars / at-risk list block used by the portfolio
 * one-pager — pulled out so the narrative reports (weekly status, steering committee) can
 * open with the same visual snapshot instead of duplicating this drawing code. Assumes the
 * caller has already drawn a masthead/title and positioned doc.y beneath it. */
export function drawPortfolioSnapshotBody(doc: PDFKit.PDFDocument, data: PortfolioOnePager) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const fullWidth = right - left;

    // KPI row
    const kpis: { label: string; value: string; tone?: string }[] = [
      { label: "Active Projects", value: String(data.activeCount) },
      { label: "Avg % Complete", value: `${data.avgPercentComplete}%` },
      {
        label: "Overdue Tasks",
        value: String(data.totalOverdueTasks),
        tone: data.totalOverdueTasks > 0 ? "#dc2626" : "#059669",
      },
      {
        label: "Open High Risks",
        value: String(data.totalOpenHighRisks),
        tone: data.totalOpenHighRisks > 0 ? "#dc2626" : "#059669",
      },
    ];
    const kpiGap = 10;
    const kpiWidth = (fullWidth - kpiGap * (kpis.length - 1)) / kpis.length;
    const kpiTop = doc.y;
    kpis.forEach((k, i) => {
      const x = left + i * (kpiWidth + kpiGap);
      doc.roundedRect(x, kpiTop, kpiWidth, 54, 5).fillAndStroke(BRAND.panel, BRAND.border);
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(k.label, x + 8, kpiTop + 8, { width: kpiWidth - 16 });
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(k.tone ?? BRAND.navy)
        .text(k.value, x + 8, kpiTop + 22, { width: kpiWidth - 16 });
    });
    doc.y = kpiTop + 54 + 16;

    // RAG breakdown bar
    sectionTitle(doc, "Portfolio Health (RAG)", 11);
    const ragTotal = Math.max(1, data.byRag.GREEN + data.byRag.YELLOW + data.byRag.RED);
    const barY = doc.y;
    const barHeight = 20;
    let cursorX = left;
    (["GREEN", "YELLOW", "RED"] as const).forEach((key) => {
      const count = data.byRag[key];
      const segWidth = (count / ragTotal) * fullWidth;
      if (segWidth > 0) {
        doc.rect(cursorX, barY, segWidth, barHeight).fill(`#${RAG_HEX[key]}`);
      }
      cursorX += segWidth;
    });
    doc.y = barY + barHeight + 4;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#475569")
      .text(
        `Green: ${data.byRag.GREEN}    Yellow: ${data.byRag.YELLOW}    Red: ${data.byRag.RED}`,
        left,
        doc.y
      );
    doc.moveDown(1);

    // Budget bar — value labels sit in a fixed-width gutter to the right of the bar area,
    // so the label never runs off the page edge no matter how large the bar renders (a bar
    // is at or near full width whenever its value is the larger of planned/actual, which by
    // definition happens on one of the two rows every single time).
    sectionTitle(doc, "Budget — Planned vs Actual (active projects)", 11);
    const budgetValueGutter = 160;
    const budgetBarWidth = fullWidth - budgetValueGutter;
    const maxBudget = Math.max(data.totalBudgetPlanned, data.totalBudgetActual, 1);
    const rowY1 = doc.y;
    const plannedW = Math.max(2, (data.totalBudgetPlanned / maxBudget) * budgetBarWidth);
    doc.rect(left, rowY1, plannedW, 16).fill(BRAND.indigoLight);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(BRAND.indigoDark)
      .text(`Planned: $${data.totalBudgetPlanned.toLocaleString()}`, left + budgetBarWidth + 6, rowY1 + 3, { width: budgetValueGutter - 6, lineBreak: false });
    const rowY2 = rowY1 + 20;
    const actualW = Math.max(2, (data.totalBudgetActual / maxBudget) * budgetBarWidth);
    const over = data.totalBudgetActual > data.totalBudgetPlanned;
    doc.rect(left, rowY2, actualW, 16).fill(over ? "#fca5a5" : BRAND.indigo);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(over ? "#b91c1c" : BRAND.indigoDark)
      .text(`Actual: $${data.totalBudgetActual.toLocaleString()}`, left + budgetBarWidth + 6, rowY2 + 3, { width: budgetValueGutter - 6, lineBreak: false });
    doc.y = rowY2 + 20 + 12;

    // At-risk table
    sectionTitle(doc, "Needs Attention", 11);
    if (data.topAtRisk.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("Nothing flagged — every active project is green.");
    } else {
      data.topAtRisk.forEach((p) => {
        const rowY = doc.y;
        doc.circle(left + 3, rowY + 5, 3).fill(`#${RAG_HEX[p.rag] ?? "94a3b8"}`);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(BRAND.navy)
          .text(p.name, left + 12, rowY, { width: fullWidth - 12, continued: false });
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#64748b")
          .text(`${p.stage} — ${p.reason}`, left + 12, doc.y, { width: fullWidth - 12 });
        doc.moveDown(0.4);
      });
    }
}

export function generatePortfolioOnePagerPdf(data: PortfolioOnePager, generatedAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 44 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    coverMasthead(doc, "Portfolio Executive Summary");
    drawPortfolioSnapshotBody(doc, data);

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });
}

export async function generatePortfolioOnePagerPptx(data: PortfolioOnePager, generatedAt: Date): Promise<Buffer> {
  const pptx = setupKeelPptx();

  const slide = keelSlide(pptx);
  slide.addText(BRAND.name, { x: 0.5, y: 0.2, w: 6, h: 0.4, fontSize: 13, bold: true, color: BRAND_HEX.indigo, charSpacing: 1 });
  slide.addText("Portfolio Executive Summary", { x: 0.5, y: 0.55, w: 12, h: 0.6, fontSize: 26, bold: true, color: BRAND_HEX.navy });
  slide.addText(`Generated ${generatedAt.toLocaleDateString("en-US")}`, {
    x: 0.5,
    y: 1.1,
    w: 6,
    h: 0.3,
    fontSize: 10,
    color: BRAND_HEX.muted,
  });

  const kpis: { label: string; value: string; color?: string }[] = [
    { label: "Active Projects", value: String(data.activeCount) },
    { label: "Avg % Complete", value: `${data.avgPercentComplete}%` },
    { label: "Overdue Tasks", value: String(data.totalOverdueTasks), color: data.totalOverdueTasks > 0 ? "DC2626" : "059669" },
    { label: "Open High Risks", value: String(data.totalOpenHighRisks), color: data.totalOpenHighRisks > 0 ? "DC2626" : "059669" },
  ];
  const kpiW = 2.9;
  const kpiGap = 0.25;
  kpis.forEach((k, i) => {
    const x = 0.5 + i * (kpiW + kpiGap);
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.55, w: kpiW, h: 1.15, fill: { color: BRAND_HEX.panel }, line: { color: BRAND_HEX.border }, rectRadius: 0.06 });
    slide.addText(k.label, { x: x + 0.15, y: 1.65, w: kpiW - 0.3, h: 0.3, fontSize: 11, color: BRAND_HEX.slate });
    slide.addText(k.value, { x: x + 0.15, y: 1.9, w: kpiW - 0.3, h: 0.7, fontSize: 26, bold: true, color: k.color ?? BRAND_HEX.navy });
  });

  slide.addText("Portfolio Health (RAG)", { x: 0.5, y: 2.95, w: 6, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  slide.addChart(
    pptx.ChartType.pie,
    [{ name: "RAG", labels: ["Green", "Yellow", "Red"], values: [data.byRag.GREEN, data.byRag.YELLOW, data.byRag.RED] }],
    { x: 0.5, y: 3.3, w: 3.2, h: 2.5, chartColors: [BRAND_HEX.green, BRAND_HEX.yellow, BRAND_HEX.red], showLegend: true, legendPos: "b" }
  );

  slide.addText("Budget — Planned vs Actual", { x: 4.0, y: 2.95, w: 5, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Planned", labels: ["Budget"], values: [data.totalBudgetPlanned] },
      { name: "Actual", labels: ["Budget"], values: [data.totalBudgetActual] },
    ],
    { x: 4.0, y: 3.3, w: 4.0, h: 2.5, barDir: "col", chartColors: [BRAND_HEX.indigoLight, BRAND_HEX.indigo], showLegend: true, legendPos: "b", showValue: true }
  );

  slide.addText("Needs Attention", { x: 8.3, y: 2.95, w: 4.5, h: 0.35, fontSize: 14, bold: true, color: BRAND_HEX.navy });
  if (data.topAtRisk.length === 0) {
    slide.addText("Nothing flagged — every active project is green.", { x: 8.3, y: 3.35, w: 4.5, h: 0.5, fontSize: 11, color: BRAND_HEX.slate });
  } else {
    const rows = data.topAtRisk.map((p) => [
      { text: p.name, options: { fontSize: 9, bold: true, color: BRAND_HEX.slate } },
      { text: `${p.stage}\n${p.reason}`, options: { fontSize: 8, color: BRAND_HEX.muted } },
    ]);
    slide.addTable(rows, {
      x: 8.3,
      y: 3.3,
      w: 4.5,
      h: 2.6,
      fontSize: 9,
      border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
      autoPage: false,
    });
  }

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}
