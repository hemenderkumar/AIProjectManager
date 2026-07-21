import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { BRAND, createKeelPdf, finalizeKeelPdf, coverMasthead, sectionTitle } from "@/lib/brand";

type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

function generateCharterPdf(detail: ProjectDetail): Promise<Buffer> {
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

    const materialCost = project.materialCostEstimate ?? detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0);
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
        project.architectureDiagram ? "(A generated architecture diagram is available in the app's Charter tab.)" : null,
      ]
        .filter(Boolean)
        .join("\n\n") || null
    );
    section("Internal Support Needs", project.internalSupportNeeds);
    section("ROI to Be Achieved", project.roiExpected);
    section(
      "Cost Summary",
      `Material cost: $${materialCost.toLocaleString()}\nImplementation cost (est.): $${implementationCost.toLocaleString()}\nContingency (${contingencyPercent}%): $${contingencyAmount.toLocaleString()}\nTotal incl. contingency: $${totalWithContingency.toLocaleString()}\nOngoing support (monthly est.): $${(project.ongoingSupportMonthlyCost ?? 0).toLocaleString()}`
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const detail = await getProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = await generateCharterPdf(detail);
  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-charter.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
