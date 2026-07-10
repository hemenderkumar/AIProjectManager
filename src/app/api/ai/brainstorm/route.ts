import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

type BrainstormResult = {
  angles: string[];
  openQuestions: string[];
  recommendation: string;
};

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const system = `You are helping a PM team brainstorm and align on an early-stage project idea.
This is a divergent-thinking exercise: surface different angles and open questions worth discussing,
based ONLY on what's actually written below. Do not invent details, numbers, vendors, or technologies
that weren't mentioned. If something is unclear or underspecified, put it in openQuestions rather than
guessing. The "recommendation" should be a one or two sentence suggestion on what to align on next,
phrased as a suggestion for the team to evaluate — not a definitive judgment.
Respond as JSON: { "angles": string[] (3-6 different angles/considerations worth discussing),
"openQuestions": string[] (3-6 questions the team should resolve to align), "recommendation": string }.`;

  const user = `Project name: ${p.name}
Problem statement: ${p.problemStatement || "(not provided)"}
Proposed solution: ${p.proposedSolution || "(not provided)"}
Expected benefits: ${p.expectedBenefits || "(not provided)"}
Existing ideation notes: ${p.ideationNotes || "(none)"}`;

  const { data, error } = await askClaudeJSON<BrainstormResult>(system, user, 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  return NextResponse.json(data);
}
