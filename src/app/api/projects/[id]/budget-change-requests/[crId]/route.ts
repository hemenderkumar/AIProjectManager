import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budgetChangeRequests, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { getActiveBaseline, lockNewBaseline, renderCostBreakdownSnapshot } from "@/lib/budget";
import { logAudit } from "@/lib/audit";

async function loadChangeRequest(id: string, crId: string) {
  const [row] = await db
    .select()
    .from(budgetChangeRequests)
    .where(eq(budgetChangeRequests.id, crId));
  if (!row || row.projectId !== id) return null;
  return row;
}

// Deciding a change request is a real approval moment (it moves money), not a routine edit --
// gated the same tier as approving a SOW (SUPER_USER: an internal PM/approver or a client-side
// SUPER_USER, never a plain CONTRIBUTOR/VIEWER even one staffed on the project).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; crId: string }> }
) {
  const { id, crId } = await params;
  const user = await requireProjectAccess("SUPER_USER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cr = await loadChangeRequest(id, crId);
  if (!cr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cr.status !== "PENDING") {
    return NextResponse.json({ error: `This request is already ${cr.status.toLowerCase()}.` }, { status: 409 });
  }

  const body = await req.json();
  const decision = body.decision;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }

  if (decision === "REJECTED") {
    const [updated] = await db
      .update(budgetChangeRequests)
      .set({ status: "REJECTED", decidedBy: user.name, decidedAt: new Date(), decisionNotes: body.decisionNotes || null })
      .where(eq(budgetChangeRequests.id, crId))
      .returning();

    await logAudit({
      actor: user,
      action: "budget_change_request.rejected",
      entityType: "budget_change_request",
      entityId: crId,
      detail: `${user.name} rejected the budget change request "${cr.title}" on project ${id}.`,
    });

    return NextResponse.json(updated);
  }

  // APPROVED -- resolves the same way whether or not a baseline already existed: the active
  // baseline's total (or, if this is the project's very first baseline, its live
  // budgetPlanned figure) plus this request's delta becomes the new locked baseline. See
  // lockNewBaseline's own comment for why this always appends a new version rather than
  // editing an existing one.
  const activeBaseline = await getActiveBaseline(id);
  let baseAmount = activeBaseline?.totalAmount;
  if (baseAmount == null) {
    const [project] = await db.select({ budgetPlanned: projects.budgetPlanned }).from(projects).where(eq(projects.id, id));
    baseAmount = project?.budgetPlanned ?? 0;
  }
  const newTotal = baseAmount + cr.amountDelta;
  const breakdownSnapshot = await renderCostBreakdownSnapshot(id);

  const newBaseline = await lockNewBaseline({
    projectId: id,
    totalAmount: newTotal,
    breakdownSnapshot,
    notes: `From approved change request: "${cr.title}" (${cr.amountDelta >= 0 ? "+" : ""}$${cr.amountDelta.toLocaleString()})`,
    lockedBy: user.name,
  });

  const [updated] = await db
    .update(budgetChangeRequests)
    .set({
      status: "APPROVED",
      decidedBy: user.name,
      decidedAt: new Date(),
      decisionNotes: body.decisionNotes || null,
      resultingBaselineId: newBaseline.id,
    })
    .where(eq(budgetChangeRequests.id, crId))
    .returning();

  await logAudit({
    actor: user,
    action: "budget_change_request.approved",
    entityType: "budget_change_request",
    entityId: crId,
    detail: `${user.name} approved the budget change request "${cr.title}" on project ${id}, locking baseline v${newBaseline.versionNumber} ($${newBaseline.totalAmount.toLocaleString()}).`,
  });

  return NextResponse.json(updated);
}
