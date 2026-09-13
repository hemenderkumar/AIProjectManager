import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budgetBaselines, projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { lockNewBaseline, renderCostBreakdownSnapshot } from "@/lib/budget";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(budgetBaselines)
    .where(eq(budgetBaselines.projectId, id))
    .orderBy(desc(budgetBaselines.versionNumber));
  return NextResponse.json(rows);
}

// Manually locks a fresh baseline -- either the project's very first one, or a deliberate
// re-baseline outside the normal change-request flow (e.g. correcting a mis-entered starting
// figure). Ordinary in-flight budget movement should go through a budgetChangeRequest instead,
// so its "why" is on the record; this route exists for establishing a clean starting point, not
// for routine adjustments. PM+ (same tier that can edit the Charter's own Cost Summary).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  let totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount)) {
    // No explicit figure supplied -- default to the project's own top-line budgetPlanned
    // figure, same fallback the Charter's Cost Summary already treats as the source of truth.
    const [project] = await db.select({ budgetPlanned: projects.budgetPlanned }).from(projects).where(eq(projects.id, id));
    totalAmount = project?.budgetPlanned ?? 0;
  }

  const breakdownSnapshot = await renderCostBreakdownSnapshot(id);
  const created = await lockNewBaseline({
    projectId: id,
    totalAmount,
    breakdownSnapshot,
    notes: body.notes || null,
    lockedBy: user.name,
  });

  await logAudit({
    actor: user,
    action: "budget_baseline.locked",
    entityType: "budget_baseline",
    entityId: created.id,
    detail: `${user.name} locked budget baseline v${created.versionNumber} ($${created.totalAmount.toLocaleString()}) for project ${id}.`,
  });

  return NextResponse.json(created, { status: 201 });
}
