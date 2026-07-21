import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  TableOfContents,
  TabStopType,
  TabStopPosition,
} from "docx";

const BRAND_COLOR = "4F46E5"; // indigo-600, matching the app's accent color
const MUTED = "64748B";
const HAIRLINE = "E2E8F0";

// A diagram rendered client-side (Mermaid needs a DOM — see lib/mermaidToImage.ts) and handed
// to the server as both raw SVG and a rasterized PNG. docx CAN embed the SVG directly with the
// PNG only as a fallback, but in practice Word's built-in SVG renderer chokes on the <style>/
// @keyframes blocks Mermaid emits and draws a broken, partial diagram instead of cleanly
// falling back to the PNG -- so only the PNG (already confirmed complete and correct) is used
// here. svgBase64 is still accepted/passed through the API for potential future use, just not
// embedded.
export type DiagramImage = { svgBase64: string; pngBase64: string; width: number; height: number };

// Everything about a document's identity and provenance that the old plain "title + subtitle"
// couldn't carry — used to build the cover page, running header/footer, and revision-history
// page. `companyName` is the whole branding decision: set (the project has a client company on
// it) means the document is produced FOR that company and leads with their name; null (an
// internal-only project) means it leads with Keel's own name instead. Nothing here requires a
// schema change — every field is already on the project/deliverable/sow rows.
export type DocMeta = {
  documentType: string; // e.g. "Deliverable — Detailed Design" or "Statement of Work"
  projectName: string;
  companyName: string | null;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function brandName(meta: DocMeta): string {
  return meta.companyName?.trim() || "Keel";
}

function diagramParagraph(diagram: DiagramImage): Paragraph {
  const maxDocWidth = 500; // points — fits within a standard page's margins
  let width = diagram.width;
  let height = diagram.height;
  if (width > maxDocWidth) {
    height = Math.round((height / width) * maxDocWidth);
    width = maxDocWidth;
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new ImageRun({
        type: "png",
        data: Buffer.from(diagram.pngBase64, "base64"),
        transformation: { width, height },
      }),
    ],
  });
}

function bodyParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n");
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", size: 21 })],
        spacing: { after: 100 },
      })
  );
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// The cover page — its own un-numbered, header/footer-free section so it reads as a title
// page rather than "page 1" of the running document. Leads with the company's name when the
// project has one, otherwise Keel's; either way a small "Prepared with Keel" credit keeps the
// tool attributed without competing with whichever name is the actual headline.
function coverPageChildren(title: string, subtitle: string, meta: DocMeta): Paragraph[] {
  const brand = brandName(meta);
  const confidentiality = meta.companyName
    ? `Confidential — prepared for ${meta.companyName}`
    : "Confidential — internal use only";

  const children: Paragraph[] = [
    new Paragraph({ spacing: { before: 1400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: brand, bold: true, color: BRAND_COLOR, size: 32 })],
      spacing: { after: 320 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, color: MUTED, size: 24 })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: meta.projectName, color: MUTED, size: 22 })],
      spacing: { after: 640 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: confidentiality, italics: true, color: MUTED, size: 20 })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${fmtDate(new Date())}`, color: MUTED, size: 20 })],
    }),
  ];
  if (meta.companyName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1000 },
        children: [new TextRun({ text: "Prepared with Keel", color: "94A3B8", size: 16 })],
      })
    );
  }
  return children;
}

// A real Word TOC field (not a hand-built list) — Word populates/updates it from the document's
// Heading 1-3 paragraphs when the reader opens the file (or hits F9 / "Update Field"), which is
// why every section heading below still uses HeadingLevel.HEADING_2: that's what the field scans.
function tocChildren(): (Paragraph | TableOfContents)[] {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Table of Contents", color: BRAND_COLOR })] }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  ];
}

// A lightweight change/revision-history page built from timestamps and approval fields that
// already exist on every deliverable/SOW row — no version-number column exists in the schema,
// so this infers a sensible 2-3 row history (created, revised if meaningfully edited since,
// approved) rather than requiring a migration to add real version tracking.
function revisionHistoryChildren(meta: DocMeta): (Paragraph | Table)[] {
  const rows: { version: string; date: string; note: string }[] = [];
  if (meta.createdAt) rows.push({ version: "1.0", date: fmtDate(meta.createdAt), note: "Initial draft created" });
  const revisedMeaningfully =
    meta.updatedAt && meta.createdAt && meta.updatedAt.getTime() - meta.createdAt.getTime() > 60_000;
  if (revisedMeaningfully) rows.push({ version: "1.x", date: fmtDate(meta.updatedAt), note: "Content revised" });
  if (meta.approvedBy) rows.push({ version: "Final", date: fmtDate(meta.approvedAt), note: `Approved by ${meta.approvedBy}` });
  if (rows.length === 0) rows.push({ version: "1.0", date: fmtDate(new Date()), note: "Initial draft created" });

  const headerCell = (text: string) =>
    new TableCell({
      shading: { fill: "EEF2FF" },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 19 })] })],
    });
  const cell = (text: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, size: 19 })] })] });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      left: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      right: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
    },
    rows: [
      new TableRow({ tableHeader: true, children: ["Version", "Date", "Change"].map(headerCell) }),
      ...rows.map((r) => new TableRow({ children: [cell(r.version), cell(r.date), cell(r.note)] })),
    ],
  });

  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Revision History", color: BRAND_COLOR })], spacing: { after: 160 } }),
    table,
  ];
}

function documentHeader(meta: DocMeta, title: string): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 4 } },
        children: [
          new TextRun({ text: brandName(meta), bold: true, color: BRAND_COLOR, size: 16 }),
          new TextRun({ text: `\t${title}`, color: MUTED, size: 16 }),
        ],
      }),
    ],
  });
}

function documentFooter(meta: DocMeta): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          new TextRun({ text: meta.projectName, color: "94A3B8", size: 16 }),
          new TextRun({ text: "\tPage ", color: "94A3B8", size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "94A3B8", size: 16 }),
          new TextRun({ text: " of ", color: "94A3B8", size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "94A3B8", size: 16 }),
        ],
      }),
    ],
  });
}

// Assembles the full formal shell — cover (own section, no header/footer/page number) followed
// by one continuous, numbered section holding the TOC, revision history, and the actual content
// passed in by the caller. This is what both buildSectionedDocx and buildTestCaseDocx build on.
type DocChild = Paragraph | Table | TableOfContents;

function formalDocument(title: string, subtitle: string, meta: DocMeta, contentChildren: DocChild[]): Document {
  return new Document({
    sections: [
      { properties: {}, children: coverPageChildren(title, subtitle, meta) },
      {
        properties: { titlePage: false },
        headers: { default: documentHeader(meta, title) },
        footers: { default: documentFooter(meta) },
        children: [...tocChildren(), pageBreak(), ...revisionHistoryChildren(meta), pageBreak(), ...contentChildren],
      },
    ],
  });
}

// A plain document made of a title + a series of labeled sections — used for the SOW export
// and the three narrative deliverable types (Requirements/NFR, Design, Release Documentation).
// `diagram`, when given (Detailed Design only), is inserted as an actual picture right after
// the section whose heading matches `diagramAfterHeading` (defaults to the first section).
export async function buildSectionedDocx(
  title: string,
  subtitle: string,
  sections: { heading: string; body: string }[],
  meta: DocMeta,
  diagram?: DiagramImage | null,
  diagramAfterHeading?: string
): Promise<Buffer> {
  const children: DocChild[] = [];

  for (const section of sections) {
    if (!section.body?.trim()) continue;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.heading, color: BRAND_COLOR })],
        spacing: { before: 200, after: 100 },
      })
    );
    children.push(...bodyParagraphs(section.body));

    if (diagram && section.heading === (diagramAfterHeading ?? sections[0]?.heading)) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: "Architecture Diagram", color: BRAND_COLOR })],
          spacing: { before: 100, after: 100 },
        })
      );
      children.push(diagramParagraph(diagram));
    }
  }

  const doc = formalDocument(title, subtitle, meta, children);
  return Packer.toBuffer(doc);
}

// A document whose body is a table of test cases — used for Functional Test Script / UAT
// Script deliverables, since those are structured rows rather than a single narrative body.
export async function buildTestCaseDocx(
  title: string,
  subtitle: string,
  meta: DocMeta,
  testCases: {
    sequence: number;
    scenario: string;
    steps: string | null;
    expectedResult: string | null;
    actualResult: string | null;
    status: string;
    executedBy: string | null;
    executedAt: Date | null;
  }[]
): Promise<Buffer> {
  const headerCell = (text: string) =>
    new TableCell({
      width: { size: 20, type: WidthType.PERCENTAGE },
      shading: { fill: "EEF2FF" },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 19 })] })],
    });

  const cell = (text: string) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: text || "—", size: 19 })] })],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["#", "Scenario / Steps", "Expected Result", "Actual Result", "Status", "Executed By"].map(headerCell),
  });

  const rows = testCases
    .sort((a, b) => a.sequence - b.sequence)
    .map(
      (tc) =>
        new TableRow({
          children: [
            cell(String(tc.sequence + 1)),
            cell(`${tc.scenario}${tc.steps ? `\n${tc.steps}` : ""}`),
            cell(tc.expectedResult ?? ""),
            cell(tc.actualResult ?? ""),
            cell(tc.status.replace("_", " ")),
            cell(tc.executedBy ? `${tc.executedBy}${tc.executedAt ? ` (${tc.executedAt.toLocaleDateString()})` : ""}` : ""),
          ],
        })
    );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      left: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      right: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: HAIRLINE },
    },
    rows: [headerRow, ...rows],
  });

  const children: DocChild[] =
    testCases.length === 0
      ? [new Paragraph({ children: [new TextRun({ text: "No test cases yet.", color: "94A3B8" })] })]
      : [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Test Cases", color: BRAND_COLOR })], spacing: { after: 100 } }), table];

  const doc = formalDocument(title, subtitle, meta, children);
  return Packer.toBuffer(doc);
}

export function docxHeaders(filename: string) {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

// AlignmentType is imported for callers that want to build additional custom sections
// alongside these helpers; re-exported so route files don't need a second import from "docx".
export { AlignmentType };
