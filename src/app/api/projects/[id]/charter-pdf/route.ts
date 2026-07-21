import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked, getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { BRAND, createKeelPdf, finalizeKeelPdf, coverMasthead, sectionTitle } from "@/lib/brand";
import type { DiagramImage } from "@/lib/docxExport";

type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

// requireProjectAccess collapses "not logged in / session expired" and "logged in but wrong
// role" into a single null -- for VIEWER (the lowest tier) that's misleading almost every
// time, since the real cause is nearly always the 1-hour session having quietly expired.
// Same fix as charter-docx's checkAccess.
async function checkAccess(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: NextResponse.json({ error: "Your session has expired — log in again and retry." }, { status: 401 }) };
  }
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return { error: NextResponse.json({ error: "You don't have access to this project." }, { status: 403 }) };
  if (await isDownloadBlocked(user.id)) {
    return {
      error: NextResponse.json(
        { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

function generateCharterPdf(detail: ProjectDetail, diagram: DiagramImage | null): Promise<Buffer> {
  const project = detail.project;
  const generatedAt = new Date();
  return new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const section = (label: string, value: string | null) => {
      sectionTitle(doc, label);
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(BRAND.slate)
        .text(value && value.trim() ? value : "—", { align: "left" });
      doc.moveDown(1);
    };

    coverMasthead(doc, "Project Charter", project.name);
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

    const optionsConsideredText = detail.solutionOptions.length
      ? detail.solutionOptions
          .map((o) => `${o.name}${o.isSelected ? " (selected)" : ""}${o.description ? `: ${o.description}` : ""}`)
          .join("\n")
      : null;

    const materialItems = detail.costItems.filter((c) => c.category === "MATERIAL");
    const implementationItems = detail.costItems.filter((c) => c.category === "IMPLEMENTATION");
    const ongoingItems = detail.costItems.filter((c) => c.category === "ONGOING_SUPPORT");
    const itemLines = (items: { name: string; amount: number }[]) =>
      items.map((i) => `    - ${i.name}: $${i.amount.toLocaleString()}`).join("\n");

    const materialCost = project.materialCostEstimate ?? materialItems.reduce((s, c) => s + c.amount, 0);
    const implementationCost = project.budgetPlanned ?? 0;
    const contingencyPercent = project.contingencyPercent ?? 10;
    const contingencyAmount = Math.round((materialCost + implementationCost) * (contingencyPercent / 100));
    const totalWithContingency = materialCost + implementationCost + contingencyAmount;

    section("Executive Summary", project.executiveSummary);
    section("Business Case", project.businessCase);
    section("Objectives", project.objectives);
    section("In Scope", project.scopeInScope);
    section("Out of Scope", project.scopeOutOfScope);
    section("High-Level Requirements", project.highLevelRequirements);
    section("Deliverables", project.deliverables);
    section("Success Criteria", project.successCriteria);
    section("Stakeholders", project.stakeholders);
    section("Assumptions", project.assumptionsRisks);
    section("Key Risks", project.risks);
    section("Integrated Systems", project.integratedSystems);
    section(
      "Options Considered",
      [
        optionsConsideredText,
        project.ideationAlignment ? `Why this direction was chosen: ${project.ideationAlignment}` : null,
      ]
        .filter(Boolean)
        .join("\n\n") || null
    );
    section(
      "Technical Recommendation",
      [
        project.recommendedTechnology ? `Recommended: ${project.recommendedTechnology}` : null,
        project.technicalRecommendationRationale,
        project.technicalReviewStatus
          ? `Enterprise architect review: ${project.technicalReviewStatus}${project.technicalReviewedBy ? ` by ${project.technicalReviewedBy}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join("\n") || null
    );
    section(
      "High-Level Architecture",
      [
        project.highLevelArchitecture,
        !diagram && project.architectureDiagram
          ? "(A generated architecture diagram is available in the app's Charter tab.)"
          : null,
      ]
        .filter(Boolean)
        .join("\n\n") || null
    );
    if (diagram) {
      sectionTitle(doc, "Architecture Diagram");
      const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let w = diagram.width;
      let h = diagram.height;
      if (w > maxWidth) {
        h = Math.round((h / w) * maxWidth);
        w = maxWidth;
      }
      // pdfkit's doc.image() does NOT advance the text cursor (doc.y) the way doc.text() does --
      // without manually moving past the drawn image, every section written afterward starts
      // back at the same y and renders on top of the picture. Push to a fresh page first if the
      // image wouldn't fit in the remaining space, then explicitly advance doc.y past it.
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + h > bottom) {
        doc.addPage();
      }
      const imgX = doc.page.margins.left;
      const imgY = doc.y;
      doc.image(Buffer.from(diagram.pngBase64, "base64"), imgX, imgY, { fit: [maxWidth, h] });
      doc.x = doc.page.margins.left;
      doc.y = imgY + h;
      doc.moveDown(1);
    }
    section("Internal Support Needs", project.internalSupportNeeds);
    section("ROI to Be Achieved", project.roiExpected);
    section(
      "Cost Summary",
      [
        `Material cost: $${materialCost.toLocaleString()}`,
        materialItems.length ? itemLines(materialItems) : "",
        `Implementation cost (est.): $${implementationCost.toLocaleString()}`,
        implementationItems.length ? itemLines(implementationItems) : "",
        `Contingency (${contingencyPercent}%): $${contingencyAmount.toLocaleString()}`,
        `Total incl. contingency: $${totalWithContingency.toLocaleString()}`,
        `Ongoing support (monthly est.): $${(project.ongoingSupportMonthlyCost ?? 0).toLocaleString()}`,
        ongoingItems.length ? itemLines(ongoingItems) : "",
      ].filter(Boolean).join("\n")
    );
    section(
      "Total Funding Required",
      project.totalFundingRequired != null
        ? `$${project.totalFundingRequired.toLocaleString()}`
        : null
    );

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
      .fillColor(BRAND.navy)
      .text(`Approved by: ${project.charterApprovedBy || "—"}`);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(BRAND.slate)
      .text(`Approved on: ${formatDate(project.charterApprovedAt)}`);

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });
}

// GET has no diagram — Mermaid needs a DOM the server doesn't have. The Charter tab's download
// button uses POST with a client-rendered diagram image instead (same pattern as charter-docx).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await checkAccess(id);
  if (access.error) return access.error;

  const detail = await getProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = await generateCharterPdf(detail, null);
  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-charter.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkAccess(id);
  if (access.error) return access.error;

  const detail = await getProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const diagram: DiagramImage | null = body?.diagram?.pngBase64 ? (body.diagram as DiagramImage) : null;

  const buffer = await generateCharterPdf(detail, diagram);
  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-charter.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
