import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const p = detail.project;
  const system = `You are a senior PMO consultant. Draft a formal, executive-appropriate project
charter in Markdown based on the inception/ideation notes provided — the language should read like
something you'd hand directly to a sponsor or steering committee, not casual or conversational.
That said, "formal" is about polish and phrasing, NOT brevity: every section below Executive
Summary should still be as thorough and detailed as the guidance for it calls for — do not compress
or thin out sections to sound more "executive."

Include these sections, in this order, using exactly these headings: Executive Summary, Business
Case, Objectives, Scope (In/Out), High-Level Requirements, Deliverables, Success Criteria,
Stakeholders, Assumptions & Risks, Risks, Integrated Systems, High-Level Architecture, Internal
Support Needs, ROI to Be Achieved, Material Cost Estimate, Implementation Cost Estimate, Ongoing
Support Cost Estimate (Monthly), Total Funding Required.
- "Executive Summary" is a short (4-6 sentence), standalone readout — what's being asked for, why,
  and the expected return — written so a sponsor who reads ONLY this section understands the ask.
  It summarizes what follows; it does not replace the need for the detailed sections below it.
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
- "Material Cost Estimate" gives your best-estimate ONE-TIME cost for materials/licenses/hardware/
  third-party purchases as a single dollar figure (just the number, e.g. "$15,000") — use any existing
  recorded cost items below as a floor/reference if given, and 0 if nothing like this applies.
- "Implementation Cost Estimate" gives your best-estimate ONE-TIME delivery/labor cost to build and
  deliver this project as a single dollar figure — inform it from the task count and any resource
  rates given below if present, otherwise reason from the project's scope and complexity.
- "Ongoing Support Cost Estimate (Monthly)" gives your best-estimate recurring MONTHLY cost to operate
  and support the solution after go-live, as a single dollar figure.
- "Total Funding Required" gives your best-estimate total budget as a single dollar figure with brief
  justification — this should be broadly consistent with (roughly) the material and implementation
  estimates above plus a contingency margin, not a disconnected number.
Keep each section to 2-4 sentences or a short bullet list, except the four cost estimate sections
above, which should each be just the dollar figure with at most one short clause of justification.
Return only the Markdown.`;

  const optionsSummary = detail.solutionOptions.length
    ? detail.solutionOptions.map((o) => `- ${o.name}${o.isSelected ? " (selected)" : ""}: ${o.description ?? ""}`).join("\n")
    : "n/a";

  const existingMaterialCost = detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0);
  const resourceRateSummary = detail.resources.length
    ? detail.resources.map((r) => `${r.role}${r.costPerHour != null ? ` @ $${r.costPerHour}/hr` : ""}`).join(", ")
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
Technical recommendation rationale: ${p.technicalRecommendationRationale ?? "n/a"}
Task count planned so far: ${detail.tasks.length}
Resources allocated with hourly rates: ${resourceRateSummary}
Existing recorded material cost items (if any, use as a floor/reference): ${existingMaterialCost > 0 ? `$${existingMaterialCost.toLocaleString()}` : "none recorded"}
Existing planned implementation budget (if any, use as a floor/reference): ${p.budgetPlanned ? `$${p.budgetPlanned.toLocaleString()}` : "not set"}`;

  const draft = await askClaude(system, user);
  return NextResponse.json({ draft });
}
