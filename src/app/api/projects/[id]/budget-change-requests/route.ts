import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budgetChangeRequests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { getActiveBaseline } from "@/lib/budget";
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
    .from(budgetChangeRequests)
    .where(eq(budgetChangeRequests.projectId, id))
    .orderBy(desc(budgetChangeRequests.requestedAt));
  return NextResponse.json(rows);
}

// Anyone who can contribute to the project can propose a budget change -- approval (a
// separate, higher-tier action, see [crId]/route.ts) is the actual gate. Filed against
// whatever baseline is active right now; if none exists yet, baselineId is left null and
// approving this request both creates baseline v1 and resolves it in one step.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const amountDelta = Number(body.amountDelta);
  if (!Number.isFinite(amountDelta) || amountDelta === 0) {
    return NextResponse.json({ error: "amountDelta must be a non-zero number" }, { status: 400 });
  }

  const activeBaseline = await getActiveBaseline(id);

  const [created] = await db
    .insert(budgetChangeRequests)
    .values({
      projectId: id,
      baselineId: activeBaseline?.id ?? null,
      title: body.title,
      description: body.description || null,
      amountDelta,
      requestedBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "budget_change_request.created",
    entityType: "budget_change_request",
    entityId: created.id,
    detail: `${user.name} requested a budget change of ${amountDelta >= 0 ? "+" : ""}$${amountDelta.toLocaleString()} ("${created.title}") on project ${id}.`,
  });

  return NextResponse.json(created, { status: 201 });
}
