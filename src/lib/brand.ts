import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import path from "path";
import fs from "fs";

// The Keel compass-mark logo, used in the PDF header and PPTX title slide/master so every
// exported document carries the same mark as the app itself. Read once and cached — every
// export route calls createKeelPdf/setupKeelPptx, so re-reading the file per call would be
// wasteful.
const LOGO_PNG_PATH = path.join(process.cwd(), "public", "keel-mark.png");
let cachedLogoBuffer: Buffer | null | undefined;
function getLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;
  try {
    cachedLogoBuffer = fs.readFileSync(LOGO_PNG_PATH);
  } catch {
    cachedLogoBuffer = null; // missing file shouldn't break exports — fall back to text-only
  }
  return cachedLogoBuffer;
}

// Single source of truth for Keel's export branding (PDF + PPTX) — colors, wordmark, and
// the header/footer chrome every generated document should share so a status report, a
// charter, and a portfolio summary all look like they came from the same product.
export const BRAND = {
  name: "Keel",
  tagline: "Idea to delivery, on one keel",
  navy: "#0f172a",
  slate: "#334155",
  muted: "#94a3b8",
  indigo: "#4f46e5",
  indigoDark: "#3730a3",
  indigoLight: "#c7d2fe",
  border: "#e2e8f0",
  panel: "#f8fafc",
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
} as const;

// Hex without the "#", for pptxgenjs (which wants raw hex strings).
export const BRAND_HEX = {
  navy: "0F172A",
  slate: "334155",
  muted: "94A3B8",
  indigo: "4F46E5",
  indigoDark: "3730A3",
  indigoLight: "C7D2FE",
  border: "E2E8F0",
  panel: "F8FAFC",
  green: "10B981",
  yellow: "F59E0B",
  red: "EF4444",
  white: "FFFFFF",
} as const;

export const PDF_HEADER_HEIGHT = 34;

/**
 * Creates a PDFKit document pre-wired with a Keel header on every page and a page-numbered
 * footer added at the very end (via bufferPages + a post-pass, since the total page count
 * isn't known until all content is drawn). Content should start being written immediately
 * after calling this — the cursor (doc.y) is already positioned below the header.
 */
export function createKeelPdf(opts: { size?: string | [number, number]; margin?: number } = {}) {
  const margin = opts.margin ?? 50;
  const doc = new PDFDocument({
    margin,
    size: opts.size ?? "LETTER",
    bufferPages: true,
  });

  const drawHeader = () => {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const top = margin - 32;
    doc.save();
    const logo = getLogoBuffer();
    let textLeft = left;
    if (logo) {
      doc.image(logo, left, top - 3, { width: 16, height: 16 });
      textLeft = left + 21;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy).text(BRAND.name.toUpperCase(), textLeft, top, {
      lineBreak: false,
      characterSpacing: 1.2,
    });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(BRAND.muted)
      .text("CONFIDENTIAL", left, top, { width: right - left, align: "right", lineBreak: false });
    doc
      .moveTo(left, top + 16)
      .lineTo(right, top + 16)
      .strokeColor(BRAND.indigo)
      .lineWidth(1.5)
      .stroke();
    doc.restore();
    doc.y = margin;
  };

  // Draw immediately for page 1, and again every time pdfkit auto-adds a page.
  drawHeader();
  doc.on("pageAdded", drawHeader);

  return doc;
}

/** Call once, immediately before doc.end() — stamps every buffered page with a footer. */
export function finalizeKeelPdf(doc: PDFKit.PDFDocument, generatedAt: Date) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom + 16;
    doc.save();
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(BRAND.muted)
      .text(`${BRAND.name} · Generated ${generatedAt.toLocaleDateString("en-US")}`, left, y, { lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(BRAND.muted)
      .text(`Page ${i - range.start + 1} of ${range.count}`, left, y, {
        width: right - left,
        align: "right",
        lineBreak: false,
      });
    doc.restore();
  }
}

/** Draws a standard section title with the Keel accent tick, keeping section headers consistent. */
export function sectionTitle(doc: PDFKit.PDFDocument, text: string, fontSize = 12) {
  const left = doc.page.margins.left;
  const y = doc.y;
  doc.rect(left, y + 2, 3, fontSize - 2).fill(BRAND.indigo);
  doc.font("Helvetica-Bold").fontSize(fontSize).fillColor(BRAND.navy).text(text, left + 10, y);
  doc.moveDown(0.4);
}

/** Cover-style masthead used at the top of the first page for full reports (not one-pagers). */
export function coverMasthead(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.font("Helvetica-Bold").fontSize(21).fillColor(BRAND.navy).text(title);
  if (subtitle) {
    doc.moveDown(0.1);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(BRAND.slate).text(subtitle);
  }
  doc.moveDown(0.6);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(BRAND.border)
    .stroke();
  doc.moveDown(0.8);
}

// --- PPTX ---

const MASTER_NAME = "KEEL_MASTER";

/** Registers a Keel-branded slide master (thin top accent bar + footer wordmark + page number). Call once per presentation before adding slides. */
export function registerKeelMaster(pptx: PptxGenJS) {
  const logo = getLogoBuffer();
  const objects: NonNullable<Parameters<PptxGenJS["defineSlideMaster"]>[0]["objects"]> = [
    { rect: { x: 0, y: 0, w: "100%", h: 0.08, fill: { color: BRAND_HEX.indigo } } },
  ];
  if (logo) {
    objects.push({ image: { x: 0.4, y: 7.08, w: 0.22, h: 0.22, data: `image/png;base64,${logo.toString("base64")}` } });
  }
  objects.push({
    text: {
      text: BRAND.name.toUpperCase(),
      options: { x: logo ? 0.68 : 0.4, y: 7.15, w: 3, h: 0.3, fontSize: 8, color: BRAND_HEX.muted, charSpacing: 2 },
    },
  });
  pptx.defineSlideMaster({
    title: MASTER_NAME,
    background: { color: BRAND_HEX.white },
    objects,
    slideNumber: { x: 12.6, y: 7.15, fontSize: 8, color: BRAND_HEX.muted },
  });
  return MASTER_NAME;
}

export function keelSlide(pptx: PptxGenJS) {
  return pptx.addSlide({ masterName: MASTER_NAME });
}

/** Standard wide layout every Keel presentation uses, for visual consistency across exports. */
export function setupKeelPptx(): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "KEEL_WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "KEEL_WIDE";
  registerKeelMaster(pptx);
  return pptx;
}

export function titleSlide(pptx: PptxGenJS, title: string, subtitle: string | undefined, generatedAt: Date) {
  const slide = keelSlide(pptx);
  const logo = getLogoBuffer();
  let nameX = 0.6;
  if (logo) {
    slide.addImage({ x: 0.6, y: 1.55, w: 0.5, h: 0.5, data: `image/png;base64,${logo.toString("base64")}` });
    nameX = 1.2;
  }
  slide.addText(BRAND.name, { x: nameX, y: 1.55, w: 12, h: 0.5, fontSize: 20, bold: true, color: BRAND_HEX.navy, charSpacing: 1, valign: "middle" });
  slide.addText(title, { x: 0.6, y: 2.7, w: 12, h: 0.9, fontSize: 32, bold: true, color: BRAND_HEX.navy });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.6, y: 3.6, w: 12, h: 0.6, fontSize: 18, color: BRAND_HEX.slate });
  }
  slide.addText(`Generated ${generatedAt.toLocaleDateString("en-US")}`, {
    x: 0.6,
    y: 4.25,
    w: 12,
    h: 0.4,
    fontSize: 11,
    color: BRAND_HEX.muted,
  });
  return slide;
}
