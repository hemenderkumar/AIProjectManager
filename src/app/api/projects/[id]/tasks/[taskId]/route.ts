import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { syncAllocationsFromEffort } from "@/lib/allocations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const allowed = ["title", "description", "status", "priority", "assigneeId", "startDate", "dueDate", "completedAt", "estimateHours", "actualHours", "phase", "sprintId", "storyPoints", "executionSource"];
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) {
      const v = body[key];
      if (["startDate", "dueDate", "completedAt"].includes(key)) {
        update[key] = v ? new Date(v) : null;
      } else if (key === "sprintId") {
        update[key] = v || null;
      } else {
        update[key] = v;
      }
    }
  }
  if (body.status === "DONE" && !update.completedAt) {
    update.completedAt = new Date();
  }

  const [updated] = await db.update(tasks).set(update).where(eq(tasks.id, taskId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Reassigning someone or changing effort hours changes what "fully allocated" looks
  // like for the resources involved — keep allocation % tied to actual assigned effort.
  if ("assigneeId" in body || "estimateHours" in body) {
    await syncAllocationsFromEffort(id);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(tasks).where(eq(tasks.id, taskId));
  return NextResponse.json({ ok: true });
}
