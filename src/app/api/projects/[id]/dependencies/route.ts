import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskDependencies } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Bulk listing of every dependency edge in this project -- powers the Timeline/Gantt view,
// which needs the whole graph at once rather than one task's edges at a time (see the nested
// /tasks/[taskId]/dependencies route for the per-task read/write used by the Dependencies panel).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const taskIds = projectTasks.map((t) => t.id);
  if (!taskIds.length) return NextResponse.json([]);

  const edges = await db
    .select({ id: taskDependencies.id, taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, taskIds));

  return NextResponse.json(edges);
}
