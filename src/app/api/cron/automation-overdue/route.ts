import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, resources, users } from "@/lib/db/schema";
import { and, eq, lt, ne, isNotNull } from "drizzle-orm";
import { runAutomationRules } from "@/lib/automation";

// Daily sweep for the TASK_OVERDUE automation trigger (#321) -- unlike TASK_STATUS_CHANGED
// and TASK_ASSIGNED, which fire from the mutation that caused them, "became overdue" isn't
// an event anyone triggers; it's a fact that becomes true as time passes. Same cron-driven
// pattern as notification-digest.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const overdue = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(and(ne(tasks.status, "DONE"), isNotNull(tasks.dueDate), lt(tasks.dueDate, now)));

  let fired = 0;
  for (const task of overdue) {
    const daysOverdue = task.dueDate ? Math.floor((now.getTime() - task.dueDate.getTime()) / 86_400_000) : 0;
    let assigneeEmail: string | null = null;
    let assigneeUserId: string | null = null;
    if (task.assigneeId) {
      const [resource] = await db.select({ email: resources.email }).from(resources).where(eq(resources.id, task.assigneeId));
      assigneeEmail = resource?.email ?? null;
      if (assigneeEmail) {
        const [linkedUser] = await db.select({ id: users.id }).from(users).where(eq(users.resourceId, task.assigneeId));
        assigneeUserId = linkedUser?.id ?? null;
      }
    }
    await runAutomationRules({
      trigger: "TASK_OVERDUE",
      projectId: task.projectId,
      taskId: task.id,
      taskTitle: task.title,
      assigneeUserId,
      assigneeEmail,
      daysOverdue,
    });
    fired++;
  }

  return NextResponse.json({ ok: true, tasksChecked: fired });
}
