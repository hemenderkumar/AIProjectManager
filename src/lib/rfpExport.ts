import { BRAND, createKeelPdf, finalizeKeelPdf, coverMasthead, sectionTitle } from "./brand";
import { splitSections } from "./reportExport";
import type { RfpRow } from "./rfp";

// Renders the AI-drafted (or owner-edited) RFP `content` as a real, sectioned document —
// same "cover masthead + section headings + body prose" treatment as the project charter
// export — instead of a single wall of plain text. Deliberately does NOT include the scoring
// rubric (criteria/weights): this PDF is handed to vendors as-is, and the rubric must stay
// visible only to the company owner (see the no-login vendor response route's own comments).
export function generateRfpPdf(rfp: RfpRow, projectName: string | null): Promise<Buffer> {
  const generatedAt = new Date();
  return new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    coverMasthead(doc, "Request for Proposal", rfp.title);

    const metaLine = [
      projectName ? `Project: ${projectName}` : null,
      rfp.budgetRange ? `Budget range: ${rfp.budgetRange}` : null,
      rfp.timeline ? `Timeline: ${rfp.timeline}` : null,
      rfp.publishedAt ? `Published: ${new Date(rfp.publishedAt).toLocaleDateString("en-US")}` : null,
    ]
      .filter(Boolean)
      .join("   |   ");
    if (metaLine) {
      doc.font("Helvetica").fontSize(9.5).fillColor(BRAND.muted).text(metaLine);
      doc.moveDown(1);
    }

    const sections = splitSections(rfp.content ?? "");
    if (sections.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(BRAND.slate)
        .text(rfp.content?.trim() || "This RFP has not been drafted yet.", { align: "left" });
    } else {
      for (const s of sections) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
        if (s.heading) sectionTitle(doc, s.heading);
        if (s.body) {
          doc.moveDown(0.2);
          doc.font("Helvetica").fontSize(10.5).fillColor(BRAND.slate).text(s.body, { align: "left" });
        }
        doc.moveDown(0.9);
      }
    }

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });
}
