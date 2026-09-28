import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sprintPlannings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// One Sprint Planning record per sprint -- GET returns it (or null), PATCH upserts it.
// Same single-evolving-record shape as /retro; see the comment on sprintPlannings in schema.ts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [row] = await db.select().from(sprintPlannings).where(eq(sprintPlannings.sprintId, sprintId));
  return NextResponse.json(row ?? null);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const [existing] = await db.select({ id: sprintPlannings.id }).from(sprintPlannings).where(eq(sprintPlannings.sprintId, sprintId));
  const values = {
    plannedPoints: "plannedPoints" in body ? (body.plannedPoints === "" || body.plannedPoints == null ? null : Number(body.plannedPoints)) : undefined,
    notes: "notes" in body ? body.notes || null : undefined,
    updatedBy: _authUser.name,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(sprintPlannings)
      .set(values)
      .where(eq(sprintPlannings.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }
  const [created] = await db
    .insert(sprintPlannings)
    .values({
      sprintId,
      plannedPoints: values.plannedPoints ?? null,
      notes: values.notes ?? null,
      updatedBy: values.updatedBy,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
