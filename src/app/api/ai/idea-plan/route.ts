import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { getProjectDetail } from "@/lib/portfolio";
import { computeIdeaCost, normalizePlan, type IdeaResearchData } from "@/lib/ideaEvaluation";
import { planIdea } from "@/lib/ideaResearch";

export const maxDuration = 60;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// AI cost-saving levers, partnership ideas and a 3-year projection, grounded in the idea's own
// cost lines and research. Also fills the SWOT quadrants if they're still empty (never
// overwrites ones someone wrote).
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;
  const cost = computeIdeaCost({ items: detail.costItems, ...p });
  if (cost.firstYearTotal <= 0) {
    return NextResponse.json({ error: "Estimate the cost first — savings and projections are built from it." }, { status: 400 });
  }
  const research = (p.ideaResearch ?? null) as IdeaResearchData | null;
  const evidence = [
    `COST LINES: ${detail.costItems.map((c) => `${c.category} | ${c.name} | ${money(c.amount)}${c.category === "ONGOING_SUPPORT" ? "/month" : ""}${c.notes ? ` | ${c.notes}` : ""}`).join("; ")}`,
    `TOTALS: one-time ${money(cost.oneTimeTotal)}, ongoing ${money(cost.ongoingAnnual)}/yr, first-year ${money(cost.firstYearTotal)}`,
    research ? `MARKET: ${research.summary} Size: ${research.marketSize || "unknown"}. Competitors: ${research.competitors.map((c) => `${c.name} (${c.what}${c.pricing ? `, ${c.pricing}` : ""})`).join("; ") || "none"}. Positioning: ${research.positioning}` : "MARKET RESEARCH: not done",
    p.quotedUnitPrice ? `Quoted unit price: ${money(p.quotedUnitPrice)}` : "",
    p.targetMonthlyVolume ? `Target monthly volume: ${p.targetMonthlyVolume}` : "",
  ].filter(Boolean).join("\n");

  const { raw, error } = await planIdea(
    { name: p.name, category: p.ideaCategory, problem: p.problemStatement ?? p.description, solution: p.proposedSolution, benefits: p.expectedBenefits },
    evidence,
  );
  if (!raw) return NextResponse.json({ error: error ?? "Plan generation failed" }, { status: 502 });

  const plan = normalizePlan(raw, cost, p.ideaPlan?.costAssumptions ?? "");
  if (!plan.savings.length && !plan.partnerships.length && !plan.projection) {
    return NextResponse.json({ error: "The AI didn't return a usable plan — try again." }, { status: 502 });
  }

  const sw = ((raw as { swot?: Record<string, unknown> }).swot ?? {}) as Record<string, unknown>;
  const asText = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4).map((x) => `- ${x.trim()}`).join("\n") : "");
  await db.update(projects).set({
    ideaPlan: plan,
    ...(!p.swotStrengths?.trim() && asText(sw.strengths) ? { swotStrengths: asText(sw.strengths) } : {}),
    ...(!p.swotWeaknesses?.trim() && asText(sw.weaknesses) ? { swotWeaknesses: asText(sw.weaknesses) } : {}),
    ...(!p.swotOpportunities?.trim() && asText(sw.opportunities) ? { swotOpportunities: asText(sw.opportunities) } : {}),
    ...(!p.swotThreats?.trim() && asText(sw.threats) ? { swotThreats: asText(sw.threats) } : {}),
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));
  return NextResponse.json({ plan });
}
