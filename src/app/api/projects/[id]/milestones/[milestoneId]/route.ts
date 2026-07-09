import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { milestones } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { milestoneId } = await params;
  const body = await req.json();
  const allowed = ["name", "dueDate", "completedAt", "status"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      const v = body[key];
      update[key] = ["dueDate", "completedAt"].includes(key) && v ? new Date(v) : v;
    }
  }
  if (body.status === "DONE" && !update.completedAt) update.completedAt = new Date();

  const [updated] = await db.update(milestones).set(update).where(eq(milestones.id, milestoneId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { milestoneId } = await params;
  await db.delete(milestones).where(eq(milestones.id, milestoneId));
  return NextResponse.json({ ok: true });
}
