import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusUpdates, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await db.select().from(statusUpdates).where(eq(statusUpdates.projectId, id));
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const [created] = await db
    .insert(statusUpdates)
    .values({
      projectId: id,
      ragStatus: body.ragStatus ?? "GREEN",
      percentComplete: body.percentComplete ?? 0,
      summary: body.summary ?? null,
      accomplishments: body.accomplishments ?? null,
      upcoming: body.upcoming ?? null,
      blockers: body.blockers ?? null,
    })
    .returning();

  // Keep the project's headline rag/percent in sync with the latest manual update
  await db
    .update(projects)
    .set({
      ragStatus: body.ragStatus ?? "GREEN",
      percentComplete: body.percentComplete ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));

  return NextResponse.json(created, { status: 201 });
}
