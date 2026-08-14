import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, resources, users, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { syncAllocationsFromEffort } from "@/lib/allocations";
import { notifySlackForProject } from "@/lib/slack";
import { runAutomationRules } from "@/lib/automation";
import { dispatchWebhook } from "@/lib/webhooks";

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

  // Status changes are the one task edit worth pinging Slack about by default -- everything
  // else (title tweaks, re-estimates) is too noisy for a channel to be useful.
  if (body.status && body.status !== "TODO") {
    const emoji = body.status === "DONE" ? "✅" : body.status === "BLOCKED" ? "🚧" : "▶️";
    notifySlackForProject(id, `${emoji} *${updated.title}* is now ${updated.status.replace("_", " ")}`).catch(() => {});
  }

  if (body.status) {
    const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
    dispatchWebhook(project?.organizationId ?? null, "TASK_STATUS_CHANGED", {
      taskId: updated.id,
      projectId: id,
      title: updated.title,
      status: updated.status,
    }).catch(() => {});
  }

  // Fire any matching automation rules -- best-effort, never blocks the response. Resolve
  // the assignee's resource email and, if that resource has a linked Executa login
  // (users.resourceId), their user id too, so a NOTIFY action can reach either path.
  if (updated.assigneeId && ("status" in body || "assigneeId" in body)) {
    const [resource] = await db.select({ email: resources.email }).from(resources).where(eq(resources.id, updated.assigneeId));
    const [linkedUser] = resource?.email
      ? await db.select({ id: users.id }).from(users).where(eq(users.resourceId, updated.assigneeId))
      : [];
    runAutomationRules({
      trigger: "TASK_STATUS_CHANGED",
      projectId: id,
      taskId: updated.id,
      taskTitle: updated.title,
      assigneeUserId: linkedUser?.id ?? null,
      assigneeEmail: resource?.email ?? null,
      fromStatus: body.status ? undefined : undefined,
      toStatus: updated.status,
    }).catch(() => {});
    if ("assigneeId" in body) {
      runAutomationRules({
        trigger: "TASK_ASSIGNED",
        projectId: id,
        taskId: updated.id,
        taskTitle: updated.title,
        assigneeUserId: linkedUser?.id ?? null,
        assigneeEmail: resource?.email ?? null,
      }).catch(() => {});
    }
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
