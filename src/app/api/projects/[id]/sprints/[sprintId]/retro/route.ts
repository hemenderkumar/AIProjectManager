import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sprintRetrospectives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// One retrospective record per sprint -- GET returns it (or null if none started yet), PATCH
// upserts it. Kept as a single evolving record rather than a list of comments: a retro is
// meant to converge on one shared summary, not accumulate a thread.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [row] = await db.select().from(sprintRetrospectives).where(eq(sprintRetrospectives.sprintId, sprintId));
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

  const [existing] = await db.select({ id: sprintRetrospectives.id }).from(sprintRetrospectives).where(eq(sprintRetrospectives.sprintId, sprintId));
  const values = {
    wentWell: "wentWell" in body ? body.wentWell || null : undefined,
    toImprove: "toImprove" in body ? body.toImprove || null : undefined,
    actionItems: "actionItems" in body ? body.actionItems || null : undefined,
    updatedBy: _authUser.name,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(sprintRetrospectives)
      .set(values)
      .where(eq(sprintRetrospectives.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }
  const [created] = await db
    .insert(sprintRetrospectives)
    .values({
      sprintId,
      wentWell: values.wentWell ?? null,
      toImprove: values.toImprove ?? null,
      actionItems: values.actionItems ?? null,
      updatedBy: values.updatedBy,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
