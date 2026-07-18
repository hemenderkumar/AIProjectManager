import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from "docx";

const BRAND_COLOR = "4F46E5"; // indigo-600, matching the app's accent color

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

function titleBlock(title: string, subtitle?: string): Paragraph[] {
  const blocks = [
    new Paragraph({
      children: [new TextRun({ text: "Keel", bold: true, color: BRAND_COLOR, size: 20 })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title })],
      spacing: { after: subtitle ? 60 : 240 },
    }),
  ];
  if (subtitle) {
    blocks.push(
      new Paragraph({
        children: [new TextRun({ text: subtitle, color: "64748B", size: 20 })],
        spacing: { after: 240 },
      })
    );
  }
  return blocks;
}

// A plain document made of a title + a series of labeled sections — used for the SOW export
// and the three narrative deliverable types (Requirements/NFR, Design, Release Documentation).
export async function buildSectionedDocx(
  title: string,
  subtitle: string,
  sections: { heading: string; body: string }[]
): Promise<Buffer> {
  const children: Paragraph[] = [...titleBlock(title, subtitle)];

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
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// A document whose body is a table of test cases — used for Functional Test Script / UAT
// Script deliverables, since those are structured rows rather than a single narrative body.
export async function buildTestCaseDocx(
  title: string,
  subtitle: string,
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
      top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
    },
    rows: [headerRow, ...rows],
  });

  const children = [...titleBlock(title, subtitle)];
  if (testCases.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: "No test cases yet.", color: "94A3B8" })] }));
  }

  const doc = new Document({
    sections: [
      {
        children: testCases.length > 0 ? [...children, new Paragraph({ children: [], spacing: { after: 0 } }), table] : children,
      },
    ],
  });
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
