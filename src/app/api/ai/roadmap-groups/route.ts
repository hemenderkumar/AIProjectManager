import { NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { getEligibleIdeasForRoadmap } from "@/lib/roadmap";

type GroupPlan = {
  groups: Array<{ label: string; project_ids: string[]; rationale: string }>;
};

// Answers a different question than /api/ai/roadmap: not "sequence these ideas I already
// picked" but "of everything eligible, which ones actually belong in the same roadmap
// together, and which are unrelated enough that combining them would just muddy the
// prioritization." The picklist on the Roadmap page defaults to "select everything," which is
// fine for a handful of ideas but stops making sense once a portfolio has a dozen unrelated
// initiatives sitting at different stages -- this gives a starting point instead of asking the
// user to eyeball every combination themselves.
//
// Every eligible idea must land in exactly one returned group -- a group of one is the AI
// saying "this stands alone." We re-validate that against the caller's own eligibility list
// (never trust ids the model echoes back) and backfill any idea the model dropped as its own
// standalone group, so the picklist can always map 1:1 onto suggestions without a missing idea
// silently disappearing.
export async function GET() {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const eligible = await getEligibleIdeasForRoadmap(user);
  if (eligible.length < 2) {
    return NextResponse.json(
      { error: "Need at least two eligible ideas to suggest groupings." },
      { status: 400 }
    );
  }

  const ideasSummary = eligible
    .map(
      (p, i) => `ID: ${p.id}
Name: ${p.name}
Problem: ${p.problemStatement || "(none)"}
Expected benefit: ${p.expectedBenefits || "(none)"}
Feasibility score (0-100): ${p.feasibilityScore ?? "(not assessed)"}
Architecture notes: ${p.architectureProsCons || "(not yet reviewed)"}
Integrated systems: ${p.integratedSystems || "(none noted)"}
Delivery mode: ${p.deliveryMode || "(not decided)"}${i < eligible.length - 1 ? "\n---" : ""}`
    )
    .join("\n");

  const system = `You are a portfolio prioritization advisor. You're given every initiative currently
eligible for a roadmap -- each with a problem statement, expected benefit, feasibility score,
architecture notes, and any integrated systems it touches.

Decide which initiatives are closely related enough to sequence together in ONE roadmap, and
which are unrelated enough that combining them would just muddy the prioritization. Group by
things like: shared theme or business goal, overlapping or dependent systems/architecture,
similar urgency or timing, or one being a natural prerequisite for another. Do NOT group things
just because they have similar feasibility scores -- that alone is not relatedness.

Every initiative given must appear in exactly one group. A group of exactly one initiative is a
valid, correct answer when that initiative doesn't meaningfully relate to any other -- do not
force it into an unrelated group just to make groups bigger.

Respond as JSON exactly matching this schema:
{"groups":[{"label":"short descriptive name for the group","project_ids":["<exact IDs from the list>"],"rationale":"1-2 sentences: why these belong together, or why this one stands alone"}]}
Ground every judgment only in the data given -- do not invent shared context between initiatives.`;

  const user_prompt = `Eligible initiatives:\n\n${ideasSummary}`;

  const { data, error } = await askClaudeJSON<GroupPlan>(system, user_prompt, 3000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const knownIds = new Set(eligible.map((p) => p.id));
  const nameById = new Map(eligible.map((p) => [p.id, p.name]));
  const seen = new Set<string>();
  const groups = (data.groups || [])
    .map((g) => ({
      label: g.label || "Group",
      rationale: g.rationale || "",
      projectIds: Array.from(new Set((g.project_ids || []).filter((id) => knownIds.has(id) && !seen.has(id)))),
    }))
    .filter((g) => {
      g.projectIds.forEach((id) => seen.add(id));
      return g.projectIds.length > 0;
    });

  // Safety net: any eligible idea the model didn't place anywhere becomes its own standalone
  // group, so the picklist's "apply this suggestion" action never silently drops an idea.
  for (const p of eligible) {
    if (!seen.has(p.id)) {
      groups.push({ label: p.name, rationale: "Not grouped by the AI — treated as standalone.", projectIds: [p.id] });
      seen.add(p.id);
    }
  }

  const withNames = groups.map((g) => ({
    ...g,
    projectNames: g.projectIds.map((id) => nameById.get(id) ?? "Unknown"),
  }));

  return NextResponse.json({ groups: withNames });
}
