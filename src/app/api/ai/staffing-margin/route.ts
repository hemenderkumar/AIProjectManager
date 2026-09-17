import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { projects, rateCards } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { mergeRateCardScopes } from "@/lib/deliveryModel";

type StaffingPlan = {
  roles: {
    role: string;
    headcount: number;
    rationale: string;
  }[];
  overallRationale: string;
};

// Standard full-time month, same convention as lib/forecast.ts's headcount forecast
// (40 hrs/week * 4.33 weeks/month) -- kept as a local constant rather than importing that
// module's assumption type, since this endpoint prices roles directly via Rate Cards rather
// than running the task-based skill-demand forecast (a brand-new idea has no planned tasks
// yet for that engine to read from).
const HOURS_PER_FTE_PER_MONTH = 173;

// Charter's "Staffing & Margin" recommendation: AI proposes the roles/headcount an ongoing
// production operation needs (grounded in Build Requirements + target volume, never inventing
// dollar rates), this endpoint prices that plan via Rate Cards, then back-solves against
// quotedUnitPrice/targetMarginPercent/targetMonthlyVolume to say whether the staffing plan a
// target volume implies still leaves the margin the quote assumes.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.buildInfrastructureNeeds?.trim() && !p.highLevelArchitecture?.trim()) {
    return NextResponse.json(
      { error: "Add infrastructure needs (Feasibility) or a process/architecture description (Architecture) first — there's not enough to reason about staffing from yet." },
      { status: 400 }
    );
  }
  if (!p.targetMonthlyVolume) {
    return NextResponse.json(
      { error: "Set a target monthly volume in Charter's Cost Summary first — staffing cost per unit needs a volume to divide across." },
      { status: 400 }
    );
  }

  const [globalRateCards, orgRateCards] = await Promise.all([
    db.select().from(rateCards).where(isNull(rateCards.organizationId)),
    p.organizationId ? db.select().from(rateCards).where(eq(rateCards.organizationId, p.organizationId)) : Promise.resolve([]),
  ]);
  const existingRateCards = mergeRateCardScopes(globalRateCards, orgRateCards);

  const materialCostSubtotal = detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0);

  const system = `You are proposing the ROLES and HEADCOUNT an ongoing production operation needs to hit a
target monthly volume -- not a one-time project delivery team. Ground this ONLY in the infrastructure/
process description and volume given below; do not invent roles unrelated to what's described. Do NOT
invent dollar rates or costs -- the app already has a rate card and will price this itself.

Respond as JSON: { "roles": [{ "role": string (a plain role title, e.g. "Print Operator", "QA/Assembly
Technician"), "headcount": number (FTEs needed at the target volume), "rationale": string (1 sentence) }],
"overallRationale": string (2-3 sentences on the overall staffing approach) } with 2-5 roles.`;

  const user = `Project: ${p.name}
Idea category: ${p.ideaCategory || "(not set)"}
Infrastructure needs: ${p.buildInfrastructureNeeds || "(not captured)"}
Process / architecture: ${p.highLevelArchitecture || "(not captured)"}
Target monthly volume (units): ${p.targetMonthlyVolume}
Existing rate card roles on file: ${existingRateCards.length ? [...new Set(existingRateCards.map((r) => r.role))].join(", ") : "(none yet)"}`;

  const { data, error } = await askClaudeJSON<StaffingPlan>(system, user, 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  // Price each proposed role against the rate card (org-specific rate wins over the global
  // default for the same role; a role with no rate card match is flagged, never given an
  // invented rate).
  const priced = data.roles.map((r) => {
    const match = existingRateCards.find((rc) => rc.role.toLowerCase() === r.role.toLowerCase());
    const monthlyCost = match ? r.headcount * HOURS_PER_FTE_PER_MONTH * match.hourlyRate : null;
    return { ...r, hourlyRate: match?.hourlyRate ?? null, monthlyCost };
  });

  const totalMonthlyLaborCost = priced.reduce((s, r) => s + (r.monthlyCost ?? 0), 0);
  const unpricedRoles = priced.filter((r) => r.monthlyCost === null).map((r) => r.role);
  const laborCostPerUnit = p.targetMonthlyVolume ? totalMonthlyLaborCost / p.targetMonthlyVolume : null;
  const impliedMarginPercent =
    p.quotedUnitPrice && laborCostPerUnit !== null
      ? ((p.quotedUnitPrice - materialCostSubtotal - laborCostPerUnit) / p.quotedUnitPrice) * 100
      : null;
  const marginGap =
    impliedMarginPercent !== null && p.targetMarginPercent
      ? impliedMarginPercent - p.targetMarginPercent
      : null;

  const lines: string[] = [
    data.overallRationale,
    "",
    ...priced.map((r) =>
      `${r.role}: ${r.headcount} FTE${r.headcount === 1 ? "" : "s"} — ${r.rationale}${
        r.monthlyCost !== null ? ` (~$${Math.round(r.monthlyCost).toLocaleString()}/month at $${r.hourlyRate}/hr from Rate Cards)` : " (no matching Rate Card role — add one to price this)"
      }`
    ),
    "",
    `Total staffing cost: ~$${Math.round(totalMonthlyLaborCost).toLocaleString()}/month at target volume (${p.targetMonthlyVolume}/month) = ~$${
      laborCostPerUnit !== null ? laborCostPerUnit.toFixed(2) : "?"
    }/unit.`,
  ];
  if (impliedMarginPercent !== null) {
    lines.push(
      `Implied margin at quoted price ($${p.quotedUnitPrice}/unit) minus Material ($${materialCostSubtotal.toLocaleString()}) and this staffing cost: ${impliedMarginPercent.toFixed(1)}%.`
    );
  }
  if (marginGap !== null && marginGap < 0) {
    lines.push(
      `That's ${Math.abs(marginGap).toFixed(1)} points below the ${p.targetMarginPercent}% target — raise price, raise volume (spreads fixed staffing cost thinner), or cut headcount to close the gap.`
    );
  } else if (marginGap !== null) {
    lines.push(`That clears the ${p.targetMarginPercent}% target margin by ${marginGap.toFixed(1)} points.`);
  }
  if (unpricedRoles.length) {
    lines.push(`Note: no Rate Card entry for ${unpricedRoles.join(", ")} — add one to price staffing accurately.`);
  }

  const [updated] = await db
    .update(projects)
    .set({ staffingMarginRecommendation: lines.join("\n"), updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();

  return NextResponse.json({
    project: updated,
    roles: priced,
    totalMonthlyLaborCost,
    laborCostPerUnit,
    impliedMarginPercent,
    marginGap,
  });
}
