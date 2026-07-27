import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { roadmaps, roadmapItems, roadmapPhases, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { getEligibleIdeasForRoadmap, getRoadmapDetail, derivePriorityFromRoadmap } from "@/lib/roadmap";
import { logAudit } from "@/lib/audit";

type RoadmapPlan = {
  executive_summary: string;
  items: Array<{ project_id: string; impact: "HIGH" | "MEDIUM" | "LOW"; effort: "HIGH" | "MEDIUM" | "LOW"; quick_win: boolean; rationale: string }>;
  phases: Array<{ label: string; focus: string; actions: string[] }>;
};

// Independent, on-demand action -- not a step in the Ideation gate sequence -- that looks
// across every idea that's cleared Feasibility and hasn't yet moved into Charter/Execution,
// and classifies each as a quick win vs a longer-term bet, sequenced into phases. Same
// "known inputs -> AI drafts a prioritized roadmap" pattern as the standalone
// ai-strategy-blueprint lead-gen tool, fed by data already collected on each idea instead of
// a fresh intake form.
//
// Accepts an optional { projectIds: string[] } body so the caller can build a roadmap for one
// specific idea, or any hand-picked combination, instead of always every eligible idea at once
// -- the picklist on the Roadmap page defaults to "all selected" but lets the user narrow it
// down. Every id is still re-validated against getEligibleIdeasForRoadmap() server-side, so a
// stale or forged id (an idea that lost its score, moved stage, or belongs to another org
// entirely) can't sneak into the prompt.
export async function POST(req: NextRequest) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const requestedIds: string[] | null =
    Array.isArray(body?.projectIds) && body.projectIds.every((v: unknown) => typeof v === "string") && body.projectIds.length
      ? body.projectIds
      : null;

  const eligible = await getEligibleIdeasForRoadmap(user);
  if (!eligible.length) {
    return NextResponse.json(
      { error: "No ideas are ready for a roadmap yet — an idea needs a Feasibility score (Ideation > Technical Feasibility) before it can be prioritized." },
      { status: 400 }
    );
  }

  const ideas = requestedIds ? eligible.filter((p) => requestedIds.includes(p.id)) : eligible;
  if (!ideas.length) {
    return NextResponse.json(
      { error: "None of the selected ideas are eligible anymore — refresh the page and try again." },
      { status: 400 }
    );
  }

  const ideasSummary = ideas
    .map(
      (p, i) => `ID: ${p.id}
Name: ${p.name}
Problem: ${p.problemStatement || "(none)"}
Expected benefit: ${p.expectedBenefits || "(none)"}
Feasibility score (0-100): ${p.feasibilityScore ?? "(not assessed)"}
Architecture notes: ${p.architectureProsCons || "(not yet reviewed)"}
Estimated cost: ${p.materialCostEstimate != null ? `$${p.materialCostEstimate.toLocaleString()}` : "(not estimated)"}
Delivery mode: ${p.deliveryMode || "(not decided)"}${i < ideas.length - 1 ? "\n---" : ""}`
    )
    .join("\n");

  const system = `You are a portfolio prioritization advisor for a project delivery team. You're given a
set of already-assessed initiatives -- each with a problem statement, expected benefit, a
feasibility score out of 100, architecture notes, an estimated cost, and a delivery mode.

For EACH initiative, classify:
- impact: HIGH, MEDIUM, or LOW -- how much the expected benefit matters relative to the others given.
- effort: HIGH, MEDIUM, or LOW -- derived from feasibility score, architecture complexity, and cost
  (low feasibility score, complex architecture, or high cost all push effort up).
- quick_win: true only if impact is MEDIUM or higher AND effort is LOW. Otherwise false.
- rationale: 1-2 sentences grounding the impact/effort call in the specific data given.

Then produce a 3-phase sequencing plan (label each phase "Days 1-30", "Days 31-60", "Days 61-90")
recommending which initiatives to pursue in which phase and why, plus a 3-4 sentence executive
summary of the overall prioritization logic (lead with the quick wins).

Respond as JSON exactly matching this schema, with exactly one items entry per initiative given,
in the same order:
{"executive_summary":"3-4 sentences","items":[{"project_id":"<echo the exact ID given>","impact":"HIGH|MEDIUM|LOW","effort":"HIGH|MEDIUM|LOW","quick_win":true,"rationale":"1-2 sentences"}],"phases":[{"label":"Days 1-30","focus":"short phrase","actions":["",""]},{"label":"Days 31-60","focus":"","actions":["",""]},{"label":"Days 61-90","focus":"","actions":["",""]}]}
Ground every judgment only in the data given -- do not invent details about any initiative.`;

  const user_prompt = `Initiatives to prioritize:\n\n${ideasSummary}`;

  const { data, error } = await askClaudeJSON<RoadmapPlan>(system, user_prompt, 4000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const ideaIds = new Set(ideas.map((p) => p.id));
  const items = (data.items || []).filter((it) => ideaIds.has(it.project_id));
  if (!items.length) {
    return NextResponse.json({ error: "The AI's response didn't reference any of the given initiatives — try again." }, { status: 502 });
  }

  const [roadmap] = await db
    .insert(roadmaps)
    .values({ organizationId: user.organizationId, executiveSummary: data.executive_summary, createdBy: user.name })
    .returning();

  await db.insert(roadmapItems).values(
    items.map((it, i) => ({
      roadmapId: roadmap.id,
      projectId: it.project_id,
      impact: it.impact,
      effort: it.effort,
      quickWin: !!it.quick_win,
      rationale: it.rationale,
      sortOrder: i,
    }))
  );

  const phases = data.phases || [];
  if (phases.length) {
    await db.insert(roadmapPhases).values(
      phases.map((p, i) => ({
        roadmapId: roadmap.id,
        label: p.label,
        focus: p.focus,
        actions: (p.actions || []).map((a) => `- ${a}`).join("\n"),
        sortOrder: i,
      }))
    );
  }

  // Feed the roadmap's classification back into each project's own Priority field, so
  // generating a roadmap isn't just a read-only report -- it actually moves the one priority
  // signal surfaced everywhere else (Ideation list, dashboard, AI portfolio summaries). Never
  // downgrades a project someone has manually escalated to CRITICAL -- that stays a human call.
  for (const it of items) {
    const proposed = derivePriorityFromRoadmap(it.impact, !!it.quick_win);
    const [project] = await db.select({ id: projects.id, priority: projects.priority }).from(projects).where(eq(projects.id, it.project_id));
    if (!project || project.priority === "CRITICAL" || project.priority === proposed) continue;

    await db.update(projects).set({ priority: proposed }).where(eq(projects.id, it.project_id));
    await logAudit({
      actor: user,
      action: "roadmap.priority_set",
      entityType: "project",
      entityId: it.project_id,
      organizationId: user.organizationId,
      beforeValue: project.priority,
      afterValue: proposed,
      detail: `Priority updated to ${proposed} by roadmap ${roadmap.id} (impact: ${it.impact}, quick win: ${!!it.quick_win}).`,
    });
  }

  const detail = await getRoadmapDetail(roadmap.id, user);
  return NextResponse.json({ roadmap: detail });
}
