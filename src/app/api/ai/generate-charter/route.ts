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
in Markdown based on the inception/ideation notes provided. Include these sections, in this order,
using exactly these headings: Business Case, Objectives, Scope (In/Out), Deliverables, Success Criteria,
Stakeholders, Assumptions & Risks, Risks, Integrated Systems, High-Level Architecture, ROI to Be Achieved,
Total Funding Required.
- "Assumptions & Risks" covers planning assumptions; "Risks" is a short, distinct list of the top
  project-level risks to delivery (these are summarized here, and tracked in detail elsewhere).
- "Integrated Systems" lists what this project connects to or depends on (other software, APIs, vendors,
  or — for non-software projects — other workstreams/utilities/permitting bodies it depends on).
- "High-Level Architecture" briefly describes the major components/layers and how they fit together
  (for a non-technical project, describe the overall approach/structure instead).
- "ROI to Be Achieved" states the expected return — cost savings, revenue impact, or efficiency gains —
  and over what timeframe.
- "Total Funding Required" gives your best-estimate total budget as a single dollar figure with brief
  justification.
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
