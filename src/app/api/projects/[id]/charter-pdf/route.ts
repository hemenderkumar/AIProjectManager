import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";

function generateCharterPdf(project: typeof projects.$inferSelect): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const section = (label: string, value: string | null) => {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e293b").text(label);
      doc.moveDown(0.25);
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor("#334155")
        .text(value && value.trim() ? value : "—", { align: "left" });
      doc.moveDown(1);
    };

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text("Project Charter");
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#334155").text(project.name);
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#64748b")
      .text(
        [
          project.sponsor ? `Sponsor: ${project.sponsor}` : null,
          project.projectManager ? `Project Manager: ${project.projectManager}` : null,
          project.program ? `Program: ${project.program}` : null,
          project.country ? `Country: ${project.country}` : null,
        ]
          .filter(Boolean)
          .join("   |   ")
      );
    doc.moveDown(1);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.moveDown(1);

    section("Business Case", project.businessCase);
    section("Objectives", project.objectives);
    section("In Scope", project.scopeInScope);
    section("Out of Scope", project.scopeOutOfScope);
    section("Deliverables", project.deliverables);
    section("Success Criteria", project.successCriteria);
    section("Stakeholders", project.stakeholders);
    section("Assumptions & Risks", project.assumptionsRisks);

    doc.moveDown(0.5);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.moveDown(1);

    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor("#1e293b")
      .text(`Approved by: ${project.charterApprovedBy || "—"}`);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#334155")
      .text(`Approved on: ${formatDate(project.charterApprovedAt)}`);

    doc.moveDown(2);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(`Generated ${new Date().toLocaleString("en-US")}`, { align: "left" });

    doc.end();
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = await generateCharterPdf(project);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-charter.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
