import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { milestones } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(milestones).where(eq(milestones.projectId, id));
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
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(milestones)
    .values({
      projectId: id,
      name: body.name,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: body.status ?? "TODO",
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
