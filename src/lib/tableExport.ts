import type PptxGenJS from "pptxgenjs";
import { BRAND, BRAND_HEX, createKeelPdf, finalizeKeelPdf, coverMasthead, setupKeelPptx, titleSlide } from "./brand";

export type TableColumn<T> = {
  key: string;
  label: string;
  width?: number; // relative weight; defaults to even split
  align?: "left" | "right";
  get: (row: T) => string;
};

/** A generic branded data-table export — used by every list-style screen (projects, ideation,
 * execution, support, resources) so they don't each need a bespoke PDF/PPTX layout. */
export function generateTablePdf<T>(
  title: string,
  subtitle: string | undefined,
  columns: TableColumn<T>[],
  rows: T[],
  generatedAt: Date
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    coverMasthead(doc, title, subtitle);
    doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.muted).text(`${rows.length} row${rows.length === 1 ? "" : "s"}`);
    doc.moveDown(0.6);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const fullWidth = right - left;
    const totalWeight = columns.reduce((s, c) => s + (c.width ?? 1), 0);
    const colWidths = columns.map((c) => ((c.width ?? 1) / totalWeight) * fullWidth);
    const rowHeight = 20;

    const drawHeaderRow = () => {
      const y = doc.y;
      doc.rect(left, y, fullWidth, rowHeight).fill(BRAND.navy);
      let x = left;
      columns.forEach((c, i) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor("#ffffff")
          .text(c.label, x + 6, y + 6, { width: colWidths[i] - 12, align: c.align ?? "left", lineBreak: false });
        x += colWidths[i];
      });
      doc.y = y + rowHeight;
    };

    drawHeaderRow();

    rows.forEach((row, idx) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        drawHeaderRow();
      }
      const y = doc.y;
      if (idx % 2 === 1) {
        doc.rect(left, y, fullWidth, rowHeight).fill(BRAND.panel);
      }
      let x = left;
      columns.forEach((c, i) => {
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(BRAND.slate)
          .text(c.get(row), x + 6, y + 6, { width: colWidths[i] - 12, align: c.align ?? "left", lineBreak: false, ellipsis: true });
        x += colWidths[i];
      });
      doc.y = y + rowHeight;
    });

    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor(BRAND.muted).text("No rows to show.");
    }

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });
}

export async function generateTablePptx<T>(
  title: string,
  subtitle: string | undefined,
  columns: TableColumn<T>[],
  rows: T[],
  generatedAt: Date
): Promise<Buffer> {
  const pptx = setupKeelPptx();
  titleSlide(pptx, title, subtitle, generatedAt);

  const header = columns.map((c) => ({
    text: c.label,
    options: { bold: true, color: BRAND_HEX.white, fill: { color: BRAND_HEX.navy }, fontSize: 9, align: c.align ?? "left" },
  }));
  const body = rows.map((row) =>
    columns.map((c) => ({
      text: c.get(row),
      options: { fontSize: 8.5, color: BRAND_HEX.slate, align: c.align ?? "left" },
    }))
  );

  const tableSlide = titleTableSlide(pptx, title);
  const colW = columns.map((c) => (12.3 * (c.width ?? 1)) / columns.reduce((s, cc) => s + (cc.width ?? 1), 0));

  tableSlide.addTable([header, ...body], {
    x: 0.5,
    y: 1.0,
    w: 12.3,
    colW,
    fontSize: 8.5,
    border: { type: "solid", color: BRAND_HEX.border, pt: 0.5 },
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: 1.0,
    newSlideStartY: 0.5,
  });

  const result = await pptx.write({ outputType: "nodebuffer" });
  return result as Buffer;
}

function titleTableSlide(pptx: PptxGenJS, heading: string) {
  const slide = pptx.addSlide({ masterName: "KEEL_MASTER" });
  slide.addText(heading, { x: 0.5, y: 0.35, w: 12, h: 0.55, fontSize: 20, bold: true, color: BRAND_HEX.navy });
  return slide;
}
