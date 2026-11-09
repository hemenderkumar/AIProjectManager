import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { costItems, projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { getProjectDetail } from "@/lib/portfolio";
import { estimateIdeaCost } from "@/lib/ideaResearch";

export const maxDuration = 60;

// AI first-pass cost estimate. Replaces only previously AI-created lines, so anything a person
// typed in (or edited) stays. Ongoing support lines are stored per month.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;
  if (!p.problemStatement?.trim() && !p.proposedSolution?.trim() && !p.description?.trim()) {
    return NextResponse.json({ error: "Describe the problem or solution first so there's something to estimate." }, { status: 400 });
  }

  const kept = detail.costItems.filter((c) => !c.createdByAi);
  const context = [
    p.recommendedTechnology ? `Recommended technology: ${p.recommendedTechnology}` : "",
    p.buildMaterialsList ? `Materials: ${p.buildMaterialsList}` : "",
    p.buildInfrastructureNeeds ? `Infrastructure: ${p.buildInfrastructureNeeds}` : "",
    p.feasibilityNotes ? `Feasibility notes: ${p.feasibilityNotes}` : "",
    kept.length ? `Already costed by the team (do NOT duplicate): ${kept.map((c) => `${c.name} $${c.amount}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const { lines, assumptions, error } = await estimateIdeaCost(
    { name: p.name, category: p.ideaCategory, problem: p.problemStatement ?? p.description, solution: p.proposedSolution, benefits: p.expectedBenefits },
    context,
  );
  if (error) return NextResponse.json({ error }, { status: 502 });

  await db.delete(costItems).where(and(eq(costItems.projectId, projectId), eq(costItems.createdByAi, true)));
  await db.insert(costItems).values(
    lines.map((l) => ({
      projectId, category: l.category, name: l.name, amount: l.amount, notes: l.notes,
      isRecurring: l.category === "ONGOING_SUPPORT", cadence: l.category === "ONGOING_SUPPORT" ? "monthly" : "one-time", createdByAi: true,
    })),
  );

  // Keep the project's top-line figures in step so Charter and the deck agree.
  const all = [...kept.map((c) => ({ category: c.category, amount: c.amount })), ...lines];
  const sumBy = (cat: string) => all.filter((c) => c.category === cat).reduce((s, c) => s + c.amount, 0);
  await db.update(projects).set({
    materialCostEstimate: sumBy("MATERIAL"), laborCostEstimate: sumBy("LABOR"), budgetPlanned: sumBy("IMPLEMENTATION"),
    ongoingSupportMonthlyCost: sumBy("ONGOING_SUPPORT"), updatedAt: new Date(),
  }).where(eq(projects.id, projectId));

  return NextResponse.json({ count: lines.length, assumptions });
}
