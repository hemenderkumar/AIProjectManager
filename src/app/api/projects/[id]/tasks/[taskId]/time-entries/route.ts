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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  const rows = await db.select().from(timeEntries).where(eq(timeEntries.taskId, taskId));
  return NextResponse.json(rows.sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime()));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { taskId } = await params;
  const body = await req.json();
  const hours = Number(body.hours);
  if (!hours || Number.isNaN(hours) || hours <= 0) {
    return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
  }
  const [created] = await db
    .insert(timeEntries)
    .values({
      taskId,
      resourceId: body.resourceId || null,
      hours,
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
      notes: body.notes || null,
    })
    .returning();
  const actualHours = await recomputeActualHours(taskId);
  return NextResponse.json({ entry: created, actualHours }, { status: 201 });
}
