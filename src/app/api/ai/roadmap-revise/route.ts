import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { roadmaps, roadmapItems, roadmapPhases, projects } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { getRoadmapDetail, applyRoadmapPriorityWriteBack } from "@/lib/roadmap";

type RoadmapPlan = {
  executive_summary: string;
  items: Array<{ project_id: string; impact: "HIGH" | "MEDIUM" | "LOW"; effort: "HIGH" | "MEDIUM" | "LOW"; quick_win: boolean; rationale: string }>;
  phases: Array<{ label: string; focus: string; actions: string[] }>;
};

// "Revise with AI": instead of re-running Generate from scratch (which only ever looks at
// eligible ideas fresh, and would silently drop anything that's since moved stage), this takes
// the roadmap AS IT STANDS plus a free-text instruction ("push the vendor portal to a later
// phase", "the CRM migration is riskier than shown, bump its effort") and asks the AI to
// produce a revised plan for the SAME set of projects -- classification and phasing can change,
// but which ideas are covered does not (that's what the picklist + Generate is for). Every
// revision is inserted as a brand-new roadmaps row (nothing overwritten), linked back to the
// one it revised via revisedFromRoadmapId, so the full history stays intact and browsable.
export async function POST(req: NextRequest) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const roadmapId: string | null = typeof body?.roadmapId === "string" ? body.roadmapId : null;
  const instruction: string = typeof body?.instruction === "string" ? body.instruction.trim() : "";

  if (!roadmapId) return NextResponse.json({ error: "roadmapId is required" }, { status: 400 });
  if (!instruction) return NextResponse.json({ error: "Describe what should change before revising." }, { status: 400 });

  const original = await getRoadmapDetail(roadmapId, user);
  if (!original) return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });
  if (!original.items.length) {
    return NextResponse.json({ error: "This roadmap has no items to revise." }, { status: 400 });
  }

  const projectIds = original.items.map((it) => it.projectId);
  const projectRows = await db.select().from(projects).where(inArray(projects.id, projectIds));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  const currentPlanText = original.items
    .map(
      (it, i) => `ID: ${it.projectId}
Name: ${it.projectName}
Current impact: ${it.impact}
Current effort: ${it.effort}
Current quick win: ${it.quickWin}
Current rationale: ${it.rationale || "(none)"}${i < original.items.length - 1 ? "\n---" : ""}`
    )
    .join("\n");

  const backgroundText = original.items
    .map((it, i) => {
      const p = projectById.get(it.projectId);
      return `ID: ${it.projectId}
Problem: ${p?.problemStatement || "(none)"}
Expected benefit: ${p?.expectedBenefits || "(none)"}
Feasibility score (0-100): ${p?.feasibilityScore ?? "(not assessed)"}
Architecture notes: ${p?.architectureProsCons || "(not yet reviewed)"}
Estimated cost: ${p?.materialCostEstimate != null ? `$${p.materialCostEstimate.toLocaleString()}` : "(not estimated)"}
Delivery mode: ${p?.deliveryMode || "(not decided)"}${i < original.items.length - 1 ? "\n---" : ""}`;
    })
    .join("\n");

  const phasesText = original.phases.length
    ? original.phases.map((ph) => `${ph.label}: ${ph.focus || ""}\n${(ph.actions || "").split("\n").filter(Boolean).join("\n")}`).join("\n\n")
    : "(no phases yet)";

  const system = `You are a portfolio prioritization advisor revising an EXISTING roadmap for a project
delivery team, based on the owner's feedback. You're given: the current plan (each initiative's
impact/effort/quick-win classification and rationale), the underlying data each initiative was
originally assessed from, the current phase sequencing, and a free-text instruction describing
what the owner wants changed.

Produce a REVISED plan for the exact same set of initiatives (do not add or remove any -- the
owner controls which initiatives are included elsewhere). For each initiative, re-classify:
- impact: HIGH, MEDIUM, or LOW
- effort: HIGH, MEDIUM, or LOW
- quick_win: true only if impact is MEDIUM or higher AND effort is LOW. Otherwise false.
- rationale: 1-2 sentences -- if you changed this initiative's classification because of the
  instruction, say so explicitly; if it's unchanged, you may keep the original rationale.

Apply the owner's instruction faithfully -- if it only concerns one initiative or the phase
sequencing, leave everything else as close to the current plan as makes sense. Then produce a
revised 3-phase sequencing plan (label each phase "Days 1-30", "Days 31-60", "Days 61-90") and a
3-4 sentence executive summary reflecting the revision.

Respond as JSON exactly matching this schema, with exactly one items entry per initiative given,
in the same order:
{"executive_summary":"3-4 sentences","items":[{"project_id":"<echo the exact ID given>","impact":"HIGH|MEDIUM|LOW","effort":"HIGH|MEDIUM|LOW","quick_win":true,"rationale":"1-2 sentences"}],"phases":[{"label":"Days 1-30","focus":"short phrase","actions":["",""]},{"label":"Days 31-60","focus":"","actions":["",""]},{"label":"Days 61-90","focus":"","actions":["",""]}]}
Ground every judgment only in the data given -- do not invent details about any initiative.`;

  const user_prompt = `Current plan:\n${currentPlanText}\n\nUnderlying data:\n${backgroundText}\n\nCurrent phase sequencing:\n${phasesText}\n\nOwner's instruction:\n${instruction}`;

  const { data, error } = await askClaudeJSON<RoadmapPlan>(system, user_prompt, 4000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const knownIds = new Set(projectIds);
  const items = (data.items || []).filter((it) => knownIds.has(it.project_id));
  if (!items.length) {
    return NextResponse.json({ error: "The AI's response didn't reference any of the roadmap's initiatives — try again." }, { status: 502 });
  }

  const [revision] = await db
    .insert(roadmaps)
    .values({
      organizationId: original.organizationId,
      executiveSummary: data.executive_summary,
      createdBy: user.name,
      revisedFromRoadmapId: original.id,
      revisionInstruction: instruction,
    })
    .returning();

  await db.insert(roadmapItems).values(
    items.map((it, i) => ({
      roadmapId: revision.id,
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
        roadmapId: revision.id,
        label: p.label,
        focus: p.focus,
        actions: (p.actions || []).map((a) => `- ${a}`).join("\n"),
        sortOrder: i,
      }))
    );
  }

  await applyRoadmapPriorityWriteBack(user, revision.id, items);

  const detail = await getRoadmapDetail(revision.id, user);
  return NextResponse.json({ roadmap: detail });
}
