import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sprintReviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// One Sprint Review record per sprint -- GET returns it (or null), PATCH upserts it. Same
// single-evolving-record shape as /retro and /planning; see the comment on sprintReviews in
// schema.ts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [row] = await db.select().from(sprintReviews).where(eq(sprintReviews.sprintId, sprintId));
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

  const [existing] = await db.select({ id: sprintReviews.id }).from(sprintReviews).where(eq(sprintReviews.sprintId, sprintId));
  const values = {
    demoNotes: "demoNotes" in body ? body.demoNotes || null : undefined,
    stakeholderFeedback: "stakeholderFeedback" in body ? body.stakeholderFeedback || null : undefined,
    updatedBy: _authUser.name,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(sprintReviews)
      .set(values)
      .where(eq(sprintReviews.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }
  const [created] = await db
    .insert(sprintReviews)
    .values({
      sprintId,
      demoNotes: values.demoNotes ?? null,
      stakeholderFeedback: values.stakeholderFeedback ?? null,
      updatedBy: values.updatedBy,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
