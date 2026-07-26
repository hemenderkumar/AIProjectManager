import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { getRoadmapDetail } from "@/lib/roadmap";

// Read-only Q&A grounded in one already-generated roadmap -- deliberately not the
// edit-entity/AiEditChat pattern, since there's no single row to propose field changes on
// here (a roadmap is a whole set of items + phases). This just helps someone reason about a
// plan that already exists: "why is X a quick win", "what should I tackle first", "what's
// missing" -- it never regenerates or edits the roadmap itself.
export async function POST(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roadmapId, question } = await req.json();
  if (!roadmapId || !question) {
    return NextResponse.json({ error: "roadmapId and question are required" }, { status: 400 });
  }

  const roadmap = await getRoadmapDetail(roadmapId, user);
  if (!roadmap) return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });

  const itemsSummary = roadmap.items
    .map(
      (it) =>
        `- ${it.projectName}: impact ${it.impact}, effort ${it.effort}, ${it.quickWin ? "QUICK WIN" : "longer-term"}${
          it.rationale ? ` -- ${it.rationale}` : ""
        }`
    )
    .join("\n");
  const phasesSummary = roadmap.phases
    .map((p) => `${p.label}${p.focus ? ` (${p.focus})` : ""}:\n${p.actions || "(no actions listed)"}`)
    .join("\n\n");

  const system = `You are a portfolio prioritization advisor helping a PM reason about a roadmap
that has already been generated -- you are NOT generating a new one, only explaining, defending,
or refining the reasoning behind the one given below. Be concise, specific, and reference items
and phases by name. If asked for a change (e.g. "move X earlier"), explain the tradeoff rather
than pretending to apply it -- there is no edit action from this chat.

Executive summary: ${roadmap.executiveSummary || "(none)"}

Roadmap items:
${itemsSummary || "(no items)"}

Phased sequencing:
${phasesSummary || "(no phases)"}`;

  const answer = await askClaude(system, question, 800);
  return NextResponse.json({ answer });
}
