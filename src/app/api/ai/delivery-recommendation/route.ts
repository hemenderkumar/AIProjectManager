import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { deliveryRoleMix, projects, rateCards } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { mergeRateCardScopes, type PricingModel } from "@/lib/deliveryModel";

type RoleRecommendation = {
  role: string;
  percentOfHours: number;
  onsitePercent: number;
  offshorePercent: number;
  contractorPercent: number;
  rationale: string;
};

type DeliveryRecommendation = {
  pricingModel: PricingModel;
  pricingRationale: string;
  roles: RoleRecommendation[];
  overallRationale: string;
};

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  // Ground truth, computed here — never left to the model to invent.
  const totalHours = detail.tasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  const skillSet = new Set<string>();
  detail.tasks.forEach((t) => (t.requiredSkills ?? []).forEach((s) => skillSet.add(s)));
  // Rate cards are scoped per company — only mention this project's own company's roles
  // (plus the global defaults) to the model, never another client's configured roles.
  const [globalRateCards, orgRateCards] = await Promise.all([
    db.select().from(rateCards).where(isNull(rateCards.organizationId)),
    p.organizationId ? db.select().from(rateCards).where(eq(rateCards.organizationId, p.organizationId)) : Promise.resolve([]),
  ]);
  const existingRateCards = mergeRateCardScopes(globalRateCards, orgRateCards);

  const system = `You are advising a PM on how to SOURCE and PRICE a project's execution — not on scope or
schedule. Two decisions:
1) Sourcing mix per role: what % of each role's hours should be Onsite (own staff, local), Offshore (own
staff, remote/lower-cost location), or Contractor (external, engaged for this project). Base this on
role criticality (client-facing/architecture/security-sensitive work skews Onsite; well-specified,
execution-heavy work can skew Offshore; short-term or highly specialized/niche skills suit Contractor).
2) Pricing model: "FIXED_BID" (scope, deliverables, and estimates are well-defined and stable — client
wants price certainty), "TIME_AND_MATERIALS" (scope is still evolving, exploratory, or feasibility/risk is
high), or "HYBRID" (a well-defined core delivered Fixed Bid, with an evolving or support-like portion on T&M).

Ground your role list ONLY in the skills/tasks given below — do not invent roles that aren't implied by the
work. Do NOT invent dollar amounts or rates; the app already has a rate card and will compute costs itself.
percentOfHours across all roles must sum to 100. For each role, onsitePercent + offshorePercent +
contractorPercent must sum to 100.

Respond as JSON: { "pricingModel": "FIXED_BID"|"TIME_AND_MATERIALS"|"HYBRID", "pricingRationale": string,
"overallRationale": string (2-4 sentences, the overall sourcing philosophy for this project),
"roles": [{ "role": string, "percentOfHours": number, "onsitePercent": number, "offshorePercent": number,
"contractorPercent": number, "rationale": string (1 sentence) }] } with 3 to 6 roles.`;

  const user = `Project: ${p.name}
Description: ${p.description || "(none)"}
Problem statement: ${p.problemStatement || "(none)"}
Proposed solution: ${p.proposedSolution || "(none)"}
Scope (in): ${p.scopeInScope || "(not yet defined)"}
Deliverables: ${p.deliverables || "(not yet defined)"}
Feasibility score (0-100, if assessed): ${p.feasibilityScore ?? "(not assessed)"}
Feasibility notes: ${p.feasibilityNotes || "(none)"}
Country: ${p.country || "(not specified)"}
Priority: ${p.priority}
Total estimated task hours so far: ${totalHours || "(no task plan yet — estimate roles/mix qualitatively; hours will be filled in once tasks exist)"}
Skills seen across the task plan: ${skillSet.size ? [...skillSet].join(", ") : "(no tasks planned yet)"}
Existing rate card roles on file: ${existingRateCards.length ? [...new Set(existingRateCards.map((r) => r.role))].join(", ") : "(none yet)"}`;

  const { data, error } = await askClaudeJSON<DeliveryRecommendation>(system, user, 2000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  // Normalize percentOfHours to sum to 100 in case the model drifts slightly, then turn
  // into actual hours using the deterministic total computed above.
  const rawSum = data.roles.reduce((s, r) => s + (r.percentOfHours || 0), 0) || 1;
  const normalizedRoles = data.roles.map((r) => ({
    ...r,
    percentOfHours: (r.percentOfHours / rawSum) * 100,
  }));

  // Replace previous AI-generated rows only; leave any manually-added rows untouched.
  await db
    .delete(deliveryRoleMix)
    .where(and(eq(deliveryRoleMix.projectId, projectId), eq(deliveryRoleMix.createdByAi, true)));

  const inserted = normalizedRoles.length
    ? await db
        .insert(deliveryRoleMix)
        .values(
          normalizedRoles.map((r) => ({
            projectId,
            role: r.role,
            hours: Math.round((totalHours * r.percentOfHours) / 100),
            onsitePercent: r.onsitePercent,
            offshorePercent: r.offshorePercent,
            contractorPercent: r.contractorPercent,
            rationale: r.rationale,
            createdByAi: true,
          }))
        )
        .returning()
    : [];

  const [updatedProject] = await db
    .update(projects)
    .set({
      pricingModel: data.pricingModel,
      deliveryRationale: `${data.overallRationale}\n\nPricing model rationale: ${data.pricingRationale}`,
      deliveryRecommendedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return NextResponse.json({ project: updatedProject, roleMix: inserted });
}
