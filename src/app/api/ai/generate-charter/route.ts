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
using exactly these headings: Business Case, Objectives, Scope (In/Out), High-Level Requirements,
Deliverables, Success Criteria, Stakeholders, Assumptions & Risks, Risks, Integrated Systems,
High-Level Architecture, Internal Support Needs, ROI to Be Achieved, Total Funding Required.
- "High-Level Requirements" is a short bullet list of the major user/business requirements (not
  implementation detail — what the solution must do, from the user's perspective).
- "Assumptions & Risks" covers planning assumptions; "Risks" is a short, distinct list of the top
  project-level risks to delivery (these are summarized here, and tracked in detail elsewhere).
- "Integrated Systems" lists what this project connects to or depends on (other software, APIs, vendors,
  or — for non-software projects — other workstreams/utilities/permitting bodies it depends on).
- "High-Level Architecture" briefly describes the major components/layers and how they fit together
  (for a non-technical project, describe the overall approach/structure instead). If a technical
  recommendation is provided below, build on it rather than contradicting it.
- "Internal Support Needs" describes what internal teams/roles/time commitment (e.g. security review,
  data/IT, compliance) are needed FROM the organization to execute this project — distinct from the
  ongoing support plan after go-live.
- "ROI to Be Achieved" states the expected return — cost savings, revenue impact, or efficiency gains —
  and over what timeframe.
- "Total Funding Required" gives your best-estimate total budget as a single dollar figure with brief
  justification.
Keep each section to 2-4 sentences or a short bullet list. Return only the Markdown.`;

  const optionsSummary = detail.solutionOptions.length
    ? detail.solutionOptions.map((o) => `- ${o.name}${o.isSelected ? " (selected)" : ""}: ${o.description ?? ""}`).join("\n")
    : "n/a";

  const user = `Project: ${p.name}
Description: ${p.description ?? "n/a"}
Sponsor: ${p.sponsor ?? "n/a"}
Problem statement: ${p.problemStatement ?? "n/a"}
Proposed solution: ${p.proposedSolution ?? "n/a"}
Expected benefits: ${p.expectedBenefits ?? "n/a"}
Ideation notes: ${p.ideationNotes ?? "n/a"}
Why this direction was chosen (group alignment): ${p.ideationAlignment ?? "n/a"}
Solution options considered:
${optionsSummary}
Recommended technology (enterprise-architect-reviewed): ${p.recommendedTechnology ?? "n/a"}
Technical recommendation rationale: ${p.technicalRecommendationRationale ?? "n/a"}`;

  const draft = await askClaude(system, user);
  return NextResponse.json({ draft });
}
