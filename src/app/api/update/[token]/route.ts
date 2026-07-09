import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusRequests, tasks, statusUpdates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();

  const [reqRow] = await db.select().from(statusRequests).where(eq(statusRequests.token, token));
  if (!reqRow) return NextResponse.json({ error: "This link is invalid or has expired" }, { status: 404 });
  if (reqRow.status === "COMPLETED") {
    return NextResponse.json({ error: "This update was already submitted" }, { status: 400 });
  }

  await db
    .update(statusRequests)
    .set({ status: "COMPLETED", responseText: body.responseText ?? null, respondedAt: new Date() })
    .where(eq(statusRequests.id, reqRow.id));

  if (reqRow.taskId && body.taskStatus) {
    await db
      .update(tasks)
      .set({
        status: body.taskStatus,
        actualHours: body.actualHours ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, reqRow.taskId));
  }

  await db.insert(statusUpdates).values({
    projectId: reqRow.projectId,
    ragStatus: body.ragStatus ?? "GREEN",
    percentComplete: body.percentComplete ?? 0,
    summary: body.responseText ?? null,
    blockers: body.blockers ?? null,
  });

  return NextResponse.json({ ok: true });
}
