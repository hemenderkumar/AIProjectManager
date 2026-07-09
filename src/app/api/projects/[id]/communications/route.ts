import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { communicationLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await db.select().from(communicationLogs).where(eq(communicationLogs.projectId, id));
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
