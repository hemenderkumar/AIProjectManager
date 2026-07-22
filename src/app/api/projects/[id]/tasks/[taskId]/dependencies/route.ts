import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskDependencies } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Task dependencies (#264): a directed "this task depends on X" edge. GET returns both
// directions for context -- what this task is blocked by, and what it in turn blocks -- since
// a PM deciding whether to reschedule a task needs to see both.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dependsOn = await db
    .select({ depId: taskDependencies.id, id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(eq(taskDependencies.taskId, taskId));

  const blocks = await db
    .select({ depId: taskDependencies.id, id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.taskId, tasks.id))
    .where(eq(taskDependencies.dependsOnTaskId, taskId));

  return NextResponse.json({ dependsOn, blocks });
}

// Add a dependency: this task depends on body.dependsOnTaskId. Rejects self-dependencies,
// duplicates, cross-project references, and anything that would create a cycle.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dependsOnTaskId = typeof body.dependsOnTaskId === "string" ? body.dependsOnTaskId : "";
  if (!dependsOnTaskId) return NextResponse.json({ error: "dependsOnTaskId is required" }, { status: 400 });
  if (dependsOnTaskId === taskId) return NextResponse.json({ error: "A task can't depend on itself." }, { status: 400 });

  const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const projectTaskIds = new Set(projectTasks.map((t) => t.id));
  if (!projectTaskIds.has(taskId) || !projectTaskIds.has(dependsOnTaskId)) {
    return NextResponse.json({ error: "Both tasks must belong to this project." }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)));
  if (existing) return NextResponse.json({ error: "That dependency already exists." }, { status: 400 });

  // Cycle check: walk forward from dependsOnTaskId along existing "depends on" edges. If that
  // walk reaches taskId, adding this edge would close a loop (taskId -> dependsOnTaskId -> ... -> taskId).
  const allEdges = await db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, Array.from(projectTaskIds)));
  const adjacency = new Map<string, string[]>();
  for (const e of allEdges) {
    if (!adjacency.has(e.taskId)) adjacency.set(e.taskId, []);
    adjacency.get(e.taskId)!.push(e.dependsOnTaskId);
  }
  const visited = new Set<string>();
  const queue = [dependsOnTaskId];
  let createsCycle = false;
  while (queue.length) {
    const current = queue.shift()!;
    if (current === taskId) {
      createsCycle = true;
      break;
    }
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  if (createsCycle) {
    return NextResponse.json({ error: "That would create a circular dependency." }, { status: 400 });
  }

  const [created] = await db.insert(taskDependencies).values({ taskId, dependsOnTaskId }).returning();
  return NextResponse.json(created, { status: 201 });
}
