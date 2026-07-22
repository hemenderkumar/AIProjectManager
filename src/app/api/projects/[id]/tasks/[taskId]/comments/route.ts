import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskComments, projectMembers, users, resources } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { notify, findMentionedMembers } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

// In-context task comments (#262). A flat, chronological feed per task -- see the
// task_comments schema comment for why there's no threading. Any project VIEWER+ can read;
// posting requires CONTRIBUTOR+ (the same tier that can edit a task).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id: projectId, taskId } = await params;
  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, authorUserId: taskComments.authorUserId, authorName: users.name })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorUserId, users.id))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(taskComments.createdAt);

  return NextResponse.json(rows);
}

// Posting a comment also does the @mention pass: any project member whose name appears as
// "@Name" in the body gets an in-app notification (+ best-effort email); the task's own
// assignee (a Resource, not necessarily a Keel login) gets a plain best-effort email via
// their Resource.email regardless of whether they were explicitly @mentioned, since "someone
// commented on your task" is useful even without typing their name.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id: projectId, taskId } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const [comment] = await db.insert(taskComments).values({ taskId, authorUserId: user.id, body: text }).returning();

  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));

  const link = `/projects/${projectId}?tab=tasks&task=${taskId}`;
  const mentioned = findMentionedMembers(text, members).filter((m) => m.userId !== user.id);
  await Promise.all(
    mentioned.map((m) =>
      notify({
        userId: m.userId,
        type: "MENTION",
        title: `${user.name} mentioned you on "${task.title}"`,
        body: text,
        link,
        email: m.email,
      })
    )
  );

  if (task.assigneeId) {
    const [assignee] = await db.select({ email: resources.email }).from(resources).where(eq(resources.id, task.assigneeId));
    if (assignee?.email) {
      // The assignee is a Resource, not necessarily a Keel login -- email only, no in-app row.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      sendEmail(assignee.email, `New comment on "${task.title}"`, `${user.name} commented: ${text}\n\n${appUrl}${link}`).catch(() => false);
    }
  }

  return NextResponse.json({ ...comment, authorName: user.name }, { status: 201 });
}
