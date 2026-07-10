import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brainstormEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(brainstormEntries).where(eq(brainstormEntries.projectId, id));
  return NextResponse.json(rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await requireRole("CONTRIBUTOR");
  if (!authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.content || !String(body.content).trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(brainstormEntries)
    .values({
      projectId: id,
      source: "MANUAL",
      author: body.author || authUser.name,
      content: body.content,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
