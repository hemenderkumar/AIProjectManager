import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeEntries, tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

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
  const { id, taskId, entryId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  const actualHours = await recomputeActualHours(taskId);
  return NextResponse.json({ ok: true, actualHours });
}
