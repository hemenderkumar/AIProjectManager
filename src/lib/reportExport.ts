import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import type { PlannedVsActual } from "./reportData";

type ReportInput = {
  projectName: string;
  reportText: string;
  chartData: PlannedVsActual;
  generatedAt: Date;
};

// Splits the AI-generated markdown-ish report into (heading, body) blocks so the
// PDF/PPTX can render real section headings instead of one wall of text.
function splitSections(reportText: string): { heading: string | null; body: string }[] {
  const lines = reportText.split("\n");
  const sections: { heading: string | null; body: string }[] = [];
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.*)/) || line.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (headingMatch) {
      if (current.heading !== null || current.body.some((l) => l.trim())) {
        sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
      }
      current = { heading: headingMatch[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.heading !== null || current.body.some((l) => l.trim())) {
    sections.push({ heading: current.heading, body: current.body.join("\n").trim() });
  }
  return sections.filter((s) => s.heading || s.body);
}

function findSection(sections: { heading: string | null; body: string }[], keyword: string): string | null {
  const match = sections.find((s) => s.heading && s.heading.toLowerCase().includes(keyword.toLowerCase()));
  return match?.body || null;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
}

export function generateReportPdf(input: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text("Executive Status Report");
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#334155").text(input.projectName);
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#94a3b8")
      .text(`Generated ${input.generatedAt.toLocaleString("en-US")}`);
    doc.moveDown(1);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.moveDown(1);

    // Planned vs Actual chart
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e293b").text("Planned vs Actual");
    doc.moveDown(0.6);
    drawPlannedVsActualChart(doc, input.chartData);
    doc.moveDown(1.2);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.moveDown(1);

    const sections = splitSections(input.reportText);
    for (const s of sections) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
      if (s.heading) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e293b").text(s.heading);
        doc.moveDown(0.25);
      }
      if (s.body) {
        doc.font("Helvetica").fontSize(10.5).fillColor("#334155").text(s.body, { align: "left" });
      }
      doc.moveDown(0.9);
    }

    doc.end();
  });
}

function drawPlannedVsActualChart(doc: PDFKit.PDFDocument, data: PlannedVsActual) {
  const rows: { label: string; planned: number; actual: number; format: (n: number) => string }[] = [
    { label: "Budget", planned: data.budget.planned, actual: data.budget.actual, format: (n) => `$${n.toLocaleString()}` },
    { label: "Schedule", planned: data.schedule.plannedPercent, actual: data.schedule.actualPercent, format: (n) => `${n}%` },
    { label: "Effort (hrs)", planned: data.effort.plannedHours, actual: data.effort.actualHours, format: (n) => `${n}h` },
  ];

  const chartLeft = doc.page.margins.left + 90;
  const chartWidth = doc.page.width - doc.page.margins.right - chartLeft - 70;
  const barHeight = 12;
  const rowGap = 34;

  for (const row of rows) {
    const max = Math.max(row.planned, row.actual, 1);
    const startY = doc.y;

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#334155").text(row.label, doc.page.margins.left, startY + 6, { width: 82 });

    const plannedWidth = Math.max(2, (row.planned / max) * chartWidth);
    doc.rect(chartLeft, startY, plannedWidth, barHeight).fill("#c7d2fe");
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#4338ca")
      .text(`Planned: ${row.format(row.planned)}`, chartLeft + plannedWidth + 6, startY + 1, { width: 150 });

    const actualY = startY + barHeight + 4;
    const actualWidth = Math.max(2, (row.actual / max) * chartWidth);
    const overBudgetLike = row.actual > row.planned;
    doc.rect(chartLeft, actualY, actualWidth, barHeight).fill(overBudgetLike ? "#fca5a5" : "#6366f1");
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(overBudgetLike ? "#b91c1c" : "#312e81")
      .text(`Actual: ${row.format(row.actual)}`, chartLeft + actualWidth + 6, actualY + 1, { width: 150 });

    doc.y = startY + rowGap;
  }
}

export async function generateReportPptx(input: ReportInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const NAVY = "0F172A";
  const SLATE = "334155";
  const INDIGO = "4F46E5";
  const LIGHT = "E2E8F0";

  // Title slide
  const title = pptx.addSlide();
  title.background = { color: "FFFFFF" };
  title.addText("Executive Status Report", { x: 0.6, y: 2.6, w: 12, h: 0.9, fontSize: 32, bold: true, color: NAVY });
  title.addText(input.projectName, { x: 0.6, y: 3.5, w: 12, h: 0.6, fontSize: 20, color: SLATE });
  title.addText(`Generated ${input.generatedAt.toLocaleDateString("en-US")}`, { x: 0.6, y: 4.1, w: 12, h: 0.4, fontSize: 12, color: "94A3B8" });

  // Planned vs Actual chart slide (native chart)
  const chartSlide = pptx.addSlide();
  chartSlide.addText("Planned vs Actual", { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 24, bold: true, color: NAVY });

  const categories = ["Budget ($)", "Schedule (%)", "Effort (hrs)"];
  const plannedSeries = [input.chartData.budget.planned, input.chartData.schedule.plannedPercent, input.chartData.effort.plannedHours];
  const actualSeries = [input.chartData.budget.actual, input.chartData.schedule.actualPercent, input.chartData.effort.actualHours];

  chartSlide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Planned", labels: categories, values: plannedSeries },
      { name: "Actual", labels: categories, values: actualSeries },
    ],
    {
      x: 0.6,
      y: 1.2,
      w: 12,
      h: 5.8,
      barDir: "col",
      chartColors: [INDIGO, "F97316"],
      showLegend: true,
      legendPos: "b",
      showValue: true,
      dataLabelColor: "334155",
      catAxisLabelColor: SLATE,
      valAxisLabelColor: SLATE,
    }
  );

  // Narrative slides — one per report section, chunked so text isn't cramped
  const sections = splitSections(input.reportText);
  for (const s of sections) {
    const slide = pptx.addSlide();
    if (s.heading) {
      slide.addText(s.heading, { x: 0.5, y: 0.35, w: 12, h: 0.6, fontSize: 22, bold: true, color: NAVY });
    }
    slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.0, w: 12.3, h: 0, line: { color: LIGHT, width: 1 } });
    slide.addText(s.body || "—", {
      x: 0.5,
      y: 1.2,
      w: 12.3,
      h: 5.8,
      fontSize: 14,
      color: SLATE,
      valign: "top",
      wrap: true,
    });
  }

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}

// One-pager variants: same underlying data, condensed onto a single page/slide —
// just the chart plus the two sections leadership scans first (Executive Summary,
// Recommended Actions), each truncated so nothing overflows the page.
export function generateReportOnePagerPdf(input: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text("Executive Status Report — 1-Pager");
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#334155").text(input.projectName);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(`Generated ${input.generatedAt.toLocaleString("en-US")}`);
    doc.moveDown(0.6);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e293b").text("Planned vs Actual");
    doc.moveDown(0.4);
    drawPlannedVsActualChart(doc, input.chartData);
    doc.moveDown(0.8);

    const sections = splitSections(input.reportText);
    const execSummary = findSection(sections, "executive summary");
    const actions = findSection(sections, "recommended action");

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e293b").text("Executive Summary");
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#334155")
      .text(execSummary ? truncate(execSummary, 500) : "—");
    doc.moveDown(0.7);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e293b").text("Recommended Actions");
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#334155")
      .text(actions ? truncate(actions, 500) : "—");

    doc.end();
  });
}

export async function generateReportOnePagerPptx(input: ReportInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const NAVY = "0F172A";
  const SLATE = "334155";
  const MUTED = "94A3B8";
  const INDIGO = "4F46E5";

  const slide = pptx.addSlide();
  slide.addText("Executive Status Report — 1-Pager", { x: 0.5, y: 0.3, w: 12, h: 0.5, fontSize: 22, bold: true, color: NAVY });
  slide.addText(input.projectName, { x: 0.5, y: 0.8, w: 12, h: 0.4, fontSize: 15, color: SLATE });
  slide.addText(`Generated ${input.generatedAt.toLocaleDateString("en-US")}`, { x: 0.5, y: 1.2, w: 6, h: 0.3, fontSize: 9, color: MUTED });

  const categories = ["Budget ($)", "Schedule (%)", "Effort (hrs)"];
  const plannedSeries = [input.chartData.budget.planned, input.chartData.schedule.plannedPercent, input.chartData.effort.plannedHours];
  const actualSeries = [input.chartData.budget.actual, input.chartData.schedule.actualPercent, input.chartData.effort.actualHours];
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Planned", labels: categories, values: plannedSeries },
      { name: "Actual", labels: categories, values: actualSeries },
    ],
    {
      x: 0.5,
      y: 1.6,
      w: 6.2,
      h: 5.4,
      barDir: "col",
      chartColors: [INDIGO, "F97316"],
      showLegend: true,
      legendPos: "b",
      showValue: true,
    }
  );

  const sections = splitSections(input.reportText);
  const execSummary = findSection(sections, "executive summary");
  const actions = findSection(sections, "recommended action");

  slide.addText("Executive Summary", { x: 7.0, y: 1.6, w: 5.8, h: 0.4, fontSize: 14, bold: true, color: NAVY });
  slide.addText(execSummary ? truncate(execSummary, 420) : "—", { x: 7.0, y: 2.0, w: 5.8, h: 2.4, fontSize: 11, color: SLATE, valign: "top" });

  slide.addText("Recommended Actions", { x: 7.0, y: 4.5, w: 5.8, h: 0.4, fontSize: 14, bold: true, color: NAVY });
  slide.addText(actions ? truncate(actions, 420) : "—", { x: 7.0, y: 4.9, w: 5.8, h: 2.1, fontSize: 11, color: SLATE, valign: "top" });

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}
