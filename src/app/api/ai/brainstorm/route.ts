import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { brainstormEntries } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

type BrainstormResult = {
  angles: string[];
  openQuestions: string[];
  recommendation: string;
};

export async function POST(req: NextRequest) {
  const authUser = await requireRole("CONTRIBUTOR");
  if (!authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.problemStatement?.trim() && !p.proposedSolution?.trim() && !p.ideationNotes?.trim()) {
    return NextResponse.json(
      { error: "Add a problem statement, proposed solution, or ideation notes first — there's nothing to brainstorm from yet." },
      { status: 400 }
    );
  }

  const framing =
    p.ideaType === "PROBLEM"
      ? `This is a PROBLEM-driven idea: focus on understanding root cause, impact, and urgency, and surface
multiple genuinely different solution directions worth comparing (not just refining the one proposed
solution) — a separate step will let the team log and compare specific candidate approaches.`
      : p.ideaType === "OPPORTUNITY"
      ? `This is a proactive OPPORTUNITY (no forcing problem): focus on validating whether it's actually worth
pursuing — who benefits, what would make it fail to gain traction, and what the smallest useful version
of it would look like.`
      : `The idea's origin type hasn't been set yet — brainstorm generally on the merits of the idea as described.`;

  const recentLog = detail.brainstormEntries
    .slice(0, 3)
    .map((e) => `- [${e.source}, ${e.createdAt.toLocaleDateString()}] ${e.content.slice(0, 300)}`)
    .join("\n");

  const system = `You are helping a PM team brainstorm and align on an early-stage project idea.
This is a divergent-thinking exercise: surface different angles and open questions worth discussing,
based ONLY on what's actually written below. Do not invent details, numbers, vendors, or technologies
that weren't mentioned. If something is unclear or underspecified, put it in openQuestions rather than
guessing. ${framing}
If a "previous brainstorming rounds" section is given, build on it — don't just repeat the same angles,
add something new or push the thinking further.
The "recommendation" should be a one or two sentence suggestion on what to align on next, phrased as a
suggestion for the team to evaluate — not a definitive judgment.
Respond as JSON: { "angles": string[] (3-6 different angles/considerations worth discussing),
"openQuestions": string[] (3-6 questions the team should resolve to align), "recommendation": string }.`;

  const user = `Project name: ${p.name}
Idea type: ${p.ideaType ?? "(not set)"}
Problem statement: ${p.problemStatement || "(not provided)"}
Proposed solution: ${p.proposedSolution || "(not provided)"}
Expected benefits: ${p.expectedBenefits || "(not provided)"}
Existing ideation notes: ${p.ideationNotes || "(none)"}
${recentLog ? `\nPrevious brainstorming rounds (most recent first):\n${recentLog}` : ""}`;

  const { data, error } = await askClaudeJSON<BrainstormResult>(system, user, 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const content = `Angles: ${data.angles.join(" | ")}\nOpen questions: ${data.openQuestions.join(" | ")}\nRecommendation: ${data.recommendation}`;
  const [entry] = await db
    .insert(brainstormEntries)
    .values({ projectId, source: "AI", author: "AI", content })
    .returning();

  return NextResponse.json({ ...data, entry });
}
