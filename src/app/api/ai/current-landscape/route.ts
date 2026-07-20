import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

type LandscapeResult = { currentTechLandscape: string };

// Fills in "what's the team likely running today" when the PM leaves it blank at
// Technical Feasibility time -- a reasonable, clearly-labeled default assumption for a
// typical org tackling this kind of problem, not a fact. Grounds itself only in the idea's
// own text; never invents a specific named vendor/product it wasn't told about.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  const system = `You are a pragmatic technical lead. The team hasn't described their current
technology landscape for this idea, so give a brief, clearly-hedged DEFAULT ASSUMPTION of what a
typical organization tackling a problem like this would likely already have in place today --
generic category-level statements (e.g. "a legacy on-prem system with limited API access,
manual spreadsheet-based workarounds"), never a specific named vendor/product you weren't told
about. Keep it to 2-3 sentences and make clear it's an assumption, not a fact.
Respond as JSON: { "currentTechLandscape": string }.`;

  const user = `Project name: ${p.name}
Problem statement: ${p.problemStatement || "(not provided)"}
Proposed solution: ${p.proposedSolution || "(not provided)"}
Recommended technology (if already assessed): ${p.recommendedTechnology || "(not yet assessed)"}`;

  const { data, error } = await askClaudeJSON<LandscapeResult>(system, user, 500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  return NextResponse.json(data);
}
