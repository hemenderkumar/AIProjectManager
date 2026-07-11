import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { communicationLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(communicationLogs).where(eq(communicationLogs.projectId, id));
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
  const [created] = await db
    .insert(communicationLogs)
    .values({
      projectId: id,
      type: body.type ?? "MEETING",
      summary: body.summary ?? null,
      participants: body.participants ?? null,
      actionItems: body.actionItems ?? null,
      date: body.date ? new Date(body.date) : new Date(),
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
