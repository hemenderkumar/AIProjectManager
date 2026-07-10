import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

async function recomputeActualHours(taskId: string) {
  const entries = await db.select().from(timeEntries).where(eq(timeEntries.taskId, taskId));
  const total = entries.reduce((sum, e) => sum + (e.hours ?? 0), 0);
  await db.update(tasks).set({ actualHours: total }).where(eq(tasks.id, taskId));
  return total;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string; entryId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { taskId, entryId } = await params;
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  const actualHours = await recomputeActualHours(taskId);
  return NextResponse.json({ ok: true, actualHours });
}
