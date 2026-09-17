import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type SourcingRecommendation = {
  items: {
    material: string;
    recommendation: "INSOURCE" | "OUTSOURCE";
    rationale: string;
  }[];
  overallRationale: string;
};

// Charter's "Sourcing Recommendation" -- insource vs. outsource per material/component,
// grounded only in the materials list and target volume already captured (Feasibility's
// Build Requirements, Charter's target monthly volume). Same discipline as the rest of the
// app's AI-drafted content: never a specific real vendor name or a fabricated price, since
// none were given -- this reasons about make-vs-buy at the category level, a judgment call
// a human reviews before it's final, not a lookup.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.buildMaterialsList?.trim()) {
    return NextResponse.json(
      { error: "Add a materials/components list in Feasibility (Build Requirements) first — there's nothing to reason about sourcing from yet." },
      { status: 400 }
    );
  }

  const system = `You are advising a small operation on MAKE-VS-BUY for each material/component in a
physical product idea: should they produce/source it themselves (INSOURCE) or buy it pre-made from a
supplier (OUTSOURCE)? Reason about capital cost vs. volume (low volume favors outsourcing since the
capex to do it yourself isn't justified yet; higher volume can justify insourcing), lead time, and how
core the component is to the product's differentiation (something core to what makes the product special
skews toward insourcing/control; a commodity part skews toward outsourcing).

Ground this ONLY in the materials and volume given below. Do NOT invent specific real supplier/vendor
names or exact prices -- reasoning and a directional call only, the same discipline used elsewhere in
this app's AI-drafted content.

Respond as JSON: { "items": [{ "material": string (name it plainly, matching what's in the materials
list), "recommendation": "INSOURCE"|"OUTSOURCE", "rationale": string (1-2 sentences) }], "overallRationale":
string (2-3 sentences, the overall sourcing philosophy given the volume and product) } — one item per
distinct material/component mentioned, 2-6 items.`;

  const user = `Project: ${p.name}
Idea category: ${p.ideaCategory || "(not set)"}
Materials / components: ${p.buildMaterialsList}
Infrastructure needs: ${p.buildInfrastructureNeeds || "(not captured)"}
Target monthly volume (units): ${p.targetMonthlyVolume || "(not set — reason qualitatively about low-volume/early-stage)"}
Quoted unit price: ${p.quotedUnitPrice ? `$${p.quotedUnitPrice}` : "(not set)"}`;

  const { data, error } = await askClaudeJSON<SourcingRecommendation>(system, user, 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const formatted = [
    data.overallRationale,
    "",
    ...data.items.map((i) => `${i.material}: ${i.recommendation === "INSOURCE" ? "Insource" : "Outsource"} — ${i.rationale}`),
  ].join("\n");

  const [updated] = await db
    .update(projects)
    .set({ sourcingRecommendation: formatted, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();

  return NextResponse.json({ project: updated, items: data.items, overallRationale: data.overallRationale });
}
