import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { getProjectDetail } from "@/lib/portfolio";
import { computeIdeaCost, type IdeaResearchData } from "@/lib/ideaEvaluation";
import { recommendIdea } from "@/lib/ideaResearch";

export const maxDuration = 60;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// Produces the proceed / don't-proceed recommendation with reasons for and against, from
// whatever the idea already has (research, costs, feasibility, ask). If no feasibility score
// exists yet, it also sets one (clearly a quick AI assessment, replaceable by the Technical
// Feasibility tab).
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;
  if (!p.problemStatement?.trim() && !p.proposedSolution?.trim() && !p.description?.trim()) {
    return NextResponse.json({ error: "Describe the problem or solution first." }, { status: 400 });
  }

  const cost = computeIdeaCost({ items: detail.costItems, ...p });
  const research = (p.ideaResearch ?? null) as IdeaResearchData | null;
  const evidence = [
    cost.firstYearTotal > 0 ? `COST: one-time ${money(cost.oneTimeTotal)} (materials ${money(cost.materials)}, labour ${money(cost.labor)}, implementation ${money(cost.implementation)}), ongoing ${money(cost.ongoingAnnual)}/yr, first-year ${money(cost.firstYearTotal)}` : "COST: not estimated yet",
    p.totalFundingRequired ? `FUNDING REQUESTED: ${money(p.totalFundingRequired)}` : "",
    research ? `MARKET RESEARCH (${research.webSearched ? "web-sourced" : "unverified, general knowledge"}): ${research.summary} Market size: ${research.marketSize || "unknown"}. Competitors: ${research.competitors.map((c) => c.name + " - " + c.what).join("; ") || "none found"}. Risks: ${research.risks.join("; ") || "none listed"}. Positioning: ${research.positioning}` : "MARKET RESEARCH: not done yet",
    p.feasibilityScore != null ? `FEASIBILITY SCORE (existing): ${p.feasibilityScore}/100` : "FEASIBILITY: not assessed yet",
    p.feasibilityNotes ? `Feasibility notes: ${p.feasibilityNotes}` : "",
    p.recommendedTechnology ? `Recommended approach: ${p.recommendedTechnology}` : "",
    p.buildInfrastructureNeeds ? `Infrastructure: ${p.buildInfrastructureNeeds}` : "",
    p.competitiveDifferentiation ? `Differentiation: ${p.competitiveDifferentiation}` : "",
    p.askDecisionNeeded ? `THE ASK: ${p.askDecisionNeeded}` : "",
  ].filter(Boolean).join("\n");

  const { data, error } = await recommendIdea(
    { name: p.name, category: p.ideaCategory, problem: p.problemStatement ?? p.description, solution: p.proposedSolution, benefits: p.expectedBenefits },
    evidence,
  );
  if (!data) return NextResponse.json({ error: error ?? "Recommendation failed" }, { status: 502 });

  await db.update(projects).set({
    ideaRecommendation: data,
    ...(p.feasibilityScore == null && data.feasibilityScore != null ? { feasibilityScore: data.feasibilityScore } : {}),
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));
  return NextResponse.json({ recommendation: data });
}
