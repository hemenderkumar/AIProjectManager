import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked, getCurrentUser } from "@/lib/auth";
import { generateBusinessCasePptx } from "@/lib/businessCaseExport";
import { draftBusinessCase, type BusinessCaseFields } from "@/lib/businessCaseDraft";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Same access-check shape as charter-pdf/charter-docx: distinguish "session expired" from
// "wrong role" for the VIEWER tier specifically, since that's almost always what's actually
// happened given the 1-hour session window.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await checkAccess(id);
  if (access.error) return access.error;

  const detail = await getProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  let p = detail.project;
  const implementationItems = detail.costItems
    .filter((c) => c.category === "IMPLEMENTATION")
    .map((c) => ({ name: c.name, amount: c.amount }));

  // Self-heal before export: a deck downloaded straight off a project whose Business Case
  // narrative fields were never drafted (or were drafted before a field like
  // businessCaseExecutiveSummary/competitiveDifferentiation existed) should never come out with
  // near-blank slides. Rather than depend on someone remembering to hit "Draft with AI" first,
  // fill in whatever's still missing right here, automatically, every time the deck is exported.
  // draftBusinessCase() always returns a full set, so we only take the pieces this project is
  // actually missing -- anything the PM already wrote or hand-edited is left untouched, never
  // overwritten by a fresh draft. Best-effort: if the AI call fails, export proceeds with
  // whatever's already there rather than blocking the download.
  const narrativeKeys: (keyof BusinessCaseFields)[] = [
    "businessCaseExecutiveSummary", "businessCase",
    "swotStrengths", "swotWeaknesses", "swotOpportunities", "swotThreats",
    "marketAnalysis", "marketPrediction", "competitiveDifferentiation",
    "revenueProjections", "businessRoadmap",
  ];
  const hasSomethingToDraftFrom = !!(p.problemStatement?.trim() || p.proposedSolution?.trim());
  const missingKeys = narrativeKeys.filter((k) => !p[k]?.trim());
  if (hasSomethingToDraftFrom && missingKeys.length > 0) {
    try {
      const { data } = await draftBusinessCase(p);
      if (data) {
        const fillIn: Partial<BusinessCaseFields> = {};
        for (const k of missingKeys) fillIn[k] = data[k];
        const [updated] = await db.update(projects).set({ ...fillIn, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
        if (updated) p = updated;
      }
    } catch {
      // Best-effort only -- export continues with whatever the project already had.
    }
  }

  const buffer = await generateBusinessCasePptx({
    projectName: p.name,
    businessCaseExecutiveSummary: p.businessCaseExecutiveSummary,
    problemStatement: p.problemStatement,
    proposedSolution: p.proposedSolution,
    expectedBenefits: p.expectedBenefits,
    businessCase: p.businessCase,
    swotStrengths: p.swotStrengths,
    swotWeaknesses: p.swotWeaknesses,
    swotOpportunities: p.swotOpportunities,
    swotThreats: p.swotThreats,
    marketAnalysis: p.marketAnalysis,
    marketPrediction: p.marketPrediction,
    marketSizeTam: p.marketSizeTam,
    marketSizeSam: p.marketSizeSam,
    marketSizeSom: p.marketSizeSom,
    competitiveDifferentiation: p.competitiveDifferentiation,
    revenueProjections: p.revenueProjections,
    businessRoadmap: p.businessRoadmap,
    feasibilityScore: p.feasibilityScore,
    recommendedTechnology: p.recommendedTechnology,
    technicalRecommendationRationale: p.technicalRecommendationRationale,
    buildInfrastructureNeeds: p.buildInfrastructureNeeds,
    quotedUnitPrice: p.quotedUnitPrice,
    materialCostEstimate: p.materialCostEstimate,
    targetMarginPercent: p.targetMarginPercent,
    targetMonthlyVolume: p.targetMonthlyVolume,
    contingencyPercent: p.contingencyPercent,
    totalFundingRequired: p.totalFundingRequired,
    implementationItems,
    generatedAt: new Date(),
  });

  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${slug}-business-case.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
