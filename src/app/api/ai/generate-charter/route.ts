import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const p = detail.project;
  const system = `You are a senior PMO consultant. Draft a concise, professional project charter
in Markdown based on the inception/ideation notes provided. Include these sections: Business Case,
Objectives, Scope (In/Out), Deliverables, Success Criteria, Stakeholders, Assumptions & Risks.
Keep each section to 2-4 sentences or a short bullet list. Return only the Markdown.`;

  const user = `Project: ${p.name}
Description: ${p.description ?? "n/a"}
Sponsor: ${p.sponsor ?? "n/a"}
Problem statement: ${p.problemStatement ?? "n/a"}
Proposed solution: ${p.proposedSolution ?? "n/a"}
Expected benefits: ${p.expectedBenefits ?? "n/a"}
Ideation notes: ${p.ideationNotes ?? "n/a"}`;

  const draft = await askClaude(system, user);
  return NextResponse.json({ draft });
}
