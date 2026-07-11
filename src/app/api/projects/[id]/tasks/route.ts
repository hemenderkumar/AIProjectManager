import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { syncAllocationsFromEffort } from "@/lib/allocations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(tasks).where(eq(tasks.projectId, id));
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(tasks)
    .values({
      projectId: id,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "TODO",
      priority: body.priority ?? "MEDIUM",
      assigneeId: body.assigneeId ?? null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      estimateHours: body.estimateHours ?? 0,
    })
    .returning();

  if (created.assigneeId) {
    await syncAllocationsFromEffort(id);
  }

  return NextResponse.json(created, { status: 201 });
}
