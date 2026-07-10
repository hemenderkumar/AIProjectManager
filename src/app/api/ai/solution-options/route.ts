import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { solutionOptions } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

type OptionCandidate = { name: string; description: string; pros: string; cons: string; feasibilityNotes: string };
type SolutionOptionsResult = { options: OptionCandidate[] };

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.problemStatement?.trim()) {
    return NextResponse.json(
      { error: "Add a problem statement first — solution options are generated from the problem being solved." },
      { status: 400 }
    );
  }

  const existing = detail.solutionOptions
    .map((o) => `- ${o.name}: ${o.description ?? ""}`)
    .join("\n");

  const system = `You are helping a team compare distinct ways to solve a stated problem, before they commit
to one direction. Generate 3 genuinely different candidate approaches (not variations of the same idea) —
grounded ONLY in the problem/context given below. Do not invent specific vendor names, products, prices,
or technologies that weren't mentioned; describe approaches generically (e.g. "build in-house", "buy an
off-the-shelf tool", "outsource to a specialist vendor", "do nothing / accept the risk") and let
feasibilityNotes flag what's genuinely uncertain given the limited information. If options already exist
(listed below), generate different ones, not near-duplicates.
Respond as JSON: { "options": [{ "name": string (short label), "description": string (2-3 sentences),
"pros": string, "cons": string, "feasibilityNotes": string (grounded, flags uncertainty) }] } with exactly
3 items.`;

  const user = `Project name: ${p.name}
Problem statement: ${p.problemStatement}
Proposed solution (initial idea, if any): ${p.proposedSolution || "(none yet — that's what we're comparing)"}
Expected benefits sought: ${p.expectedBenefits || "(not provided)"}
${existing ? `\nExisting options already logged (avoid duplicating these):\n${existing}` : ""}`;

  const { data, error } = await askClaudeJSON<SolutionOptionsResult>(system, user, 2000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const created = await db
    .insert(solutionOptions)
    .values(
      data.options.map((o) => ({
        projectId,
        name: o.name,
        description: o.description,
        pros: o.pros,
        cons: o.cons,
        feasibilityNotes: o.feasibilityNotes,
        createdByAi: true,
      }))
    )
    .returning();

  return NextResponse.json({ options: created });
}
