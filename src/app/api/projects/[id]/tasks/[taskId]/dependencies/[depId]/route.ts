import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskDependencies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string; depId: string }> }
) {
  const { id: projectId, taskId, depId } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .delete(taskDependencies)
    .where(and(eq(taskDependencies.id, depId), eq(taskDependencies.taskId, taskId)));

  return NextResponse.json({ ok: true });
}
