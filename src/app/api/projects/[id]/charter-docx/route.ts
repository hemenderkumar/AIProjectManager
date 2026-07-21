import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { buildSectionedDocx, docxHeaders, type DiagramImage, type DocMeta } from "@/lib/docxExport";

type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

// Word counterpart to charter-pdf — same sections, same content, just a different format for
// whoever needs an editable copy (a sponsor marking up changes, a vendor's own template
// requirements) rather than a final, view-only PDF. GET works everywhere (no diagram — Mermaid
// needs a DOM the server doesn't have); the Charter tab's download button uses POST with a
// client-rendered diagram image instead, same pattern as the Deliverables tab's Detailed Design.
async function renderCharterDocx(detail: ProjectDetail, diagram: DiagramImage | null): Promise<Buffer> {
  const p = detail.project;

  let companyName: string | null = null;
  if (p.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, p.organizationId));
    companyName = org?.name ?? null;
  }

  const meta: DocMeta = {
    documentType: "Project Charter",
    projectName: p.name,
    companyName,
    status: p.stage,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    approvedBy: p.charterApprovedBy,
    approvedAt: p.charterApprovedAt,
  };

  const materialCost = p.materialCostEstimate ?? detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0);
  const implementationCost = p.budgetPlanned ?? 0;
  const contingencyPercent = p.contingencyPercent ?? 10;
  const contingencyAmount = Math.round((materialCost + implementationCost) * (contingencyPercent / 100));
  const totalWithContingency = materialCost + implementationCost + contingencyAmount;
  const optionsConsideredText = detail.solutionOptions.length
    ? detail.solutionOptions.map((o) => `${o.name}${o.isSelected ? " (selected)" : ""}${o.description ? `: ${o.description}` : ""}`).join("\n")
    : "";

  const sections = [
    { heading: "Executive Summary", body: p.executiveSummary ?? "" },
    { heading: "Business Case", body: p.businessCase ?? "" },
    { heading: "Objectives", body: p.objectives ?? "" },
    { heading: "In Scope", body: p.scopeInScope ?? "" },
    { heading: "Out of Scope", body: p.scopeOutOfScope ?? "" },
    { heading: "High-Level Requirements", body: p.highLevelRequirements ?? "" },
    { heading: "Deliverables", body: p.deliverables ?? "" },
    { heading: "Success Criteria", body: p.successCriteria ?? "" },
    { heading: "Stakeholders", body: p.stakeholders ?? "" },
    { heading: "Assumptions", body: p.assumptionsRisks ?? "" },
    { heading: "Key Risks", body: p.risks ?? "" },
    { heading: "Integrated Systems", body: p.integratedSystems ?? "" },
    {
      heading: "Options Considered",
      body: [optionsConsideredText, p.ideationAlignment ? `Why this direction was chosen: ${p.ideationAlignment}` : ""].filter(Boolean).join("\n\n"),
    },
    {
      heading: "Technical Recommendation",
      body: [
        p.recommendedTechnology ? `Recommended: ${p.recommendedTechnology}` : "",
        p.technicalRecommendationRationale ?? "",
        p.technicalReviewStatus ? `Enterprise architect review: ${p.technicalReviewStatus}${p.technicalReviewedBy ? ` by ${p.technicalReviewedBy}` : ""}` : "",
      ].filter(Boolean).join("\n"),
    },
    { heading: "High-Level Architecture", body: p.highLevelArchitecture ?? "" },
    { heading: "Internal Support Needs", body: p.internalSupportNeeds ?? "" },
    { heading: "ROI to Be Achieved", body: p.roiExpected ?? "" },
    {
      heading: "Cost Summary",
      body: `Material cost: $${materialCost.toLocaleString()}\nImplementation cost (est.): $${implementationCost.toLocaleString()}\nContingency (${contingencyPercent}%): $${contingencyAmount.toLocaleString()}\nTotal incl. contingency: $${totalWithContingency.toLocaleString()}\nOngoing support (monthly est.): $${(p.ongoingSupportMonthlyCost ?? 0).toLocaleString()}`,
    },
    { heading: "Total Funding Required", body: p.totalFundingRequired != null ? `$${p.totalFundingRequired.toLocaleString()}` : "" },
    {
      heading: "Approval",
      body: p.charterApprovedBy ? `Approved by ${p.charterApprovedBy} on ${p.charterApprovedAt?.toLocaleDateString()}` : "Not yet approved.",
    },
  ];

  return buildSectionedDocx(p.name, "Project Charter", sections, meta, diagram, "High-Level Architecture");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const buffer = await renderCharterDocx(detail, null);
  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}-charter.docx`) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json().catch(() => ({}));
  const diagram: DiagramImage | null = body?.diagram?.svgBase64 && body?.diagram?.pngBase64 ? (body.diagram as DiagramImage) : null;

  const buffer = await renderCharterDocx(detail, diagram);
  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}-charter.docx`) });
}
