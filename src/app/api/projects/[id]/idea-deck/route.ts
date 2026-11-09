import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked, getCurrentUser } from "@/lib/auth";
import { generateIdeaDeck } from "@/lib/ideaDeck";
import { computeIdeaCost, type IdeaResearchData, type IdeaRecommendation } from "@/lib/ideaEvaluation";

// The Idea Evaluation deck (Executa pitch-deck style). Only reads what's already saved -- it
// never calls the AI itself, so it's fast and always reflects exactly what the hub shows.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Your session has expired — log in again and retry." }, { status: 401 });
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "You don't have access to this project." }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json({ error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." }, { status: 403 });
  }
  const detail = await getProjectDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  const p = detail.project;

  const buffer = await generateIdeaDeck({
    name: p.name,
    problem: p.problemStatement, solution: p.proposedSolution, benefits: p.expectedBenefits,
    executiveSummary: p.businessCaseExecutiveSummary,
    feasibilityScore: p.feasibilityScore, recommendedTechnology: p.recommendedTechnology, feasibilityNotes: p.feasibilityNotes,
    infrastructure: p.buildInfrastructureNeeds ?? p.buildMaterialsList,
    marketAnalysis: p.marketAnalysis, competitiveDifferentiation: p.competitiveDifferentiation,
    swot: { strengths: p.swotStrengths, weaknesses: p.swotWeaknesses, opportunities: p.swotOpportunities, threats: p.swotThreats },
    roadmap: p.businessRoadmap,
    research: (p.ideaResearch ?? null) as IdeaResearchData | null,
    cost: computeIdeaCost({ items: detail.costItems, ...p }),
    ask: { decision: p.askDecisionNeeded, team: p.askTeam, timeline: p.askTimeline, ifApproved: p.askIfApproved, ifDeclined: p.askIfDeclined, funding: p.totalFundingRequired },
    recommendation: (p.ideaRecommendation ?? null) as IdeaRecommendation | null,
    plan: p.ideaPlan ?? null,
    costLines: detail.costItems.map((c) => ({ category: c.category, name: c.name, amount: c.amount, notes: c.notes })),
    generatedAt: new Date(),
  });

  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "idea";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${slug}-evaluation-deck.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
