import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { standupEntries } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Daily Scrum log for a sprint -- GET returns the full log (newest first), POST adds one
// entry. No PATCH/DELETE for v1: like a chat log, entries are append-only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(standupEntries)
    .where(eq(standupEntries.sprintId, sprintId))
    .orderBy(desc(standupEntries.date));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const { id, sprintId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.yesterday?.trim() && !body.today?.trim() && !body.blockers?.trim()) {
    return NextResponse.json({ error: "Fill in at least one of the three fields." }, { status: 400 });
  }
  const [created] = await db
    .insert(standupEntries)
    .values({
      sprintId,
      resourceId: body.resourceId || null,
      date: body.date ? new Date(body.date) : new Date(),
      yesterday: body.yesterday || null,
      today: body.today || null,
      blockers: body.blockers || null,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
