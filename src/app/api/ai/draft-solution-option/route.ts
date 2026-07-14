import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

type SolutionOptionDraft = {
  description: string;
  pros: string;
  cons: string;
};

// Fills out a manually-named solution option (a name, and optionally a short description)
// with a fuller description, plus pros and cons -- grounded in the project's actual problem
// statement so it isn't generic filler. Same "rough input -> structured record" pattern as
// the other drafting endpoints, scoped to one candidate option in Ideation's solution comparison.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!name) {
    return NextResponse.json({ error: "Name this option first, then draft with AI." }, { status: 400 });
  }

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const p = detail.project;

  const system = `You are helping a team flesh out ONE candidate solution option they've already named, as
part of comparing distinct ways to solve a stated problem before committing to a direction. Ground your
answer ONLY in the problem/context given below -- do not invent specific vendor names, products, or prices
that weren't mentioned.

Project: ${p.name}
Problem statement: ${p.problemStatement || "(not provided)"}
Option name (already chosen by the team): ${name}
${description ? `Option description so far: ${description}` : "(no description written yet)"}

Respond as JSON: { "description": 2-3 sentences describing this specific approach (expand on what's given,
don't just repeat the name), "pros": 1-2 sentences on the genuine advantages of this approach for this
problem, "cons": 1-2 sentences on the genuine drawbacks or risks of this approach for this problem }`;

  const { data, error } = await askClaudeJSON<SolutionOptionDraft>(system, "Draft this solution option now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
