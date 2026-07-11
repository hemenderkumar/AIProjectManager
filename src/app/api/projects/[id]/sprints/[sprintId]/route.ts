import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sprints, tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const allowed = ["name", "goal", "startDate", "endDate", "status"] as const;
const dateFields = ["startDate", "endDate"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const v = body[key];
    if ((dateFields as readonly string[]).includes(key)) {
      update[key] = v ? new Date(v) : null;
    } else {
      update[key] = v === "" ? null : v;
    }
  }

  const [updated] = await db.update(sprints).set(update).where(eq(sprints.id, sprintId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Unassign any tasks from this sprint first (they go back to the backlog) rather than
  // leaving a dangling reference or relying on a DB-level cascade for something this visible.
  await db.update(tasks).set({ sprintId: null }).where(eq(tasks.sprintId, sprintId));
  await db.delete(sprints).where(eq(sprints.id, sprintId));
  return NextResponse.json({ ok: true });
}
