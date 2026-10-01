import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { recordPortfolioDecision } from "@/lib/portfolioBoard";
import { logAudit } from "@/lib/audit";

const DECISION_TYPES = ["FUND", "DEFER", "HOLD", "KILL"];

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.projectId || !DECISION_TYPES.includes(body.decisionType)) {
    return NextResponse.json({ error: "projectId and a valid decisionType are required" }, { status: 400 });
  }

  const created = await recordPortfolioDecision(user, {
    projectId: body.projectId,
    decisionType: body.decisionType,
    budgetRequested: body.budgetRequested ?? null,
    budgetApproved: body.budgetApproved ?? null,
    rationale: body.rationale ?? null,
  });
  if (!created) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await logAudit({
    actor: user,
    action: "portfolio_decision.recorded",
    entityType: "portfolio_decision",
    entityId: created.id,
    detail: `${created.decisionType} decision recorded for project ${created.projectId}`,
  });

  return NextResponse.json(created, { status: 201 });
}
