import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

type FeasibilityResult = {
  technicalApproach: string;
  feasibilityScore: number;
  feasibilityRating: "Low" | "Medium" | "High";
  keyRisks: string[];
  openQuestions: string[];
  assumptions: string[];
};

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.proposedSolution?.trim() && !p.description?.trim()) {
    return NextResponse.json(
      { error: "Add a proposed solution or description first — there's not enough to assess feasibility from yet." },
      { status: 400 }
    );
  }

  const system = `You are a pragmatic technical lead doing an early feasibility assessment of a proposed
project. Ground everything ONLY in the information given below — do not invent specific vendors,
technologies, integrations, prior incidents, or costs that weren't mentioned. Where something is
genuinely uncertain from the given information, say so explicitly in "assumptions" or "openQuestions"
rather than stating it as fact. feasibilityScore is 0-100 reflecting how confident a team could be
executing this with normal effort given only what's described (not a guess dressed as precision — round
to the nearest 5 and note in assumptions if the basis for the score is thin).
Respond as JSON: { "technicalApproach": string (2-4 sentences, high level, no invented specifics),
"feasibilityScore": number, "feasibilityRating": "Low"|"Medium"|"High",
"keyRisks": string[] (3-5 items), "openQuestions": string[] (3-5 items),
"assumptions": string[] (2-4 things being assumed given limited info) }.`;

  const user = `Project name: ${p.name}
Description: ${p.description || "(not provided)"}
Problem statement: ${p.problemStatement || "(not provided)"}
Proposed solution: ${p.proposedSolution || "(not provided)"}
Expected benefits: ${p.expectedBenefits || "(not provided)"}
Integrated systems (from charter, if any): ${p.integratedSystems || "(not provided)"}
High-level architecture (from charter, if any): ${p.highLevelArchitecture || "(not provided)"}`;

  const { data, error } = await askClaudeJSON<FeasibilityResult>(system, user, 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  return NextResponse.json(data);
}
