import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

// Field names match CharterTab's form state 1:1 on purpose -- the client just spreads this
// response straight into its form, no parsing/mapping layer to keep in sync.
type DraftCharterResult = {
  executiveSummary: string;
  businessCase: string;
  objectives: string;
  scopeInScope: string;
  scopeOutOfScope: string;
  highLevelRequirements: string;
  deliverables: string;
  successCriteria: string;
  stakeholders: string;
  assumptionsRisks: string;
  risks: string;
  integratedSystems: string;
  highLevelArchitecture: string;
  internalSupportNeeds: string;
  roiExpected: string;
  materialCostEstimate: number;
  budgetPlanned: number;
  ongoingSupportMonthlyCost: number;
  totalFundingRequired: number;
};

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
  // Structured JSON output rather than markdown-with-headings-to-parse: the previous
  // approach relied on the model reliably emitting an exact "## Heading" line per section,
  // which it didn't always do consistently (an Executive Summary written as a lead-in
  // paragraph rather than its own heading would silently fail to parse and show up empty
  // client-side) -- same reliable pattern already used by draft-sow/draft-deliverable.
  const system = `You are a senior PMO consultant. Draft a formal, executive-appropriate project
charter based on the inception/ideation notes provided — the language should read like something
you'd hand directly to a sponsor or steering committee, not casual or conversational. That said,
"formal" is about polish and phrasing, NOT brevity: every field below (other than the cost figures
and executiveSummary itself) should still be as thorough and detailed as its guidance calls for —
do not compress or thin out fields to sound more "executive."

Respond as JSON with these exact keys, each a plain string (or number, where noted) — no nested
objects, no markdown headings:
{
  "executiveSummary": string (4-6 sentences, standalone — what's being asked for, why, and the
    expected return, written so a sponsor who reads ONLY this understands the ask. It summarizes
    the rest; it does not replace the need for the detailed fields below.),
  "businessCase": string (2-4 sentences),
  "objectives": string (short bullet list, one per line),
  "scopeInScope": string (short bullet list, one per line, what IS in scope),
  "scopeOutOfScope": string (short bullet list, one per line, what is explicitly NOT in scope),
  "highLevelRequirements": string (short bullet list of major user/business requirements — not
    implementation detail, what the solution must do from the user's perspective),
  "deliverables": string (short bullet list),
  "successCriteria": string (short bullet list),
  "stakeholders": string (short bullet list, role/name and their stake),
  "assumptionsRisks": string (planning assumptions, short bullet list),
  "risks": string (top project-level delivery risks, distinct from assumptionsRisks, short bullet
    list — these are summarized here, tracked in detail elsewhere),
  "integratedSystems": string (what this project connects to or depends on — other software,
    APIs, vendors, or for non-software projects, other workstreams/utilities/permitting bodies),
  "highLevelArchitecture": string (major components/layers and how they fit together — for a
    non-technical project, describe the overall approach/structure instead; if a technical
    recommendation is given below, build on it rather than contradicting it),
  "internalSupportNeeds": string (what internal teams/roles/time commitment — security review,
    IT, compliance — are needed FROM the organization to execute this, distinct from ongoing
    support after go-live),
  "roiExpected": string (2-3 sentences — expected return, cost savings/revenue impact/efficiency
    gains, and over what timeframe),
  "materialCostEstimate": number (best-estimate ONE-TIME cost for materials/licenses/hardware/
    third-party purchases, just the number in dollars, no symbols/commas — use any existing
    recorded cost items given below as a floor/reference, 0 if nothing like this applies),
  "budgetPlanned": number (best-estimate ONE-TIME delivery/labor cost to build and deliver this
    project, just the number in dollars — inform it from the task count and resource rates given
    below if present, otherwise reason from scope and complexity),
  "ongoingSupportMonthlyCost": number (best-estimate recurring MONTHLY cost to operate/support the
    solution after go-live, just the number in dollars),
  "totalFundingRequired": number (best-estimate total budget, just the number in dollars — should
    be broadly consistent with materialCostEstimate + budgetPlanned plus a contingency margin, not
    a disconnected figure)
}`;

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

  // Low temperature (default is ~1) so repeated runs on the same, unchanged project data
  // don't produce wildly different cost figures each time -- this is an estimate grounded in
  // the project's actual scope/resources/existing cost items, not a creative-writing task.
  const { data, error } = await askClaudeJSON<DraftCharterResult>(system, user, 4000, 0.2);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json(data);
}
