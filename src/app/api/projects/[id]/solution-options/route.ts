import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { solutionOptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(solutionOptions).where(eq(solutionOptions.projectId, id));
  return NextResponse.json(rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(solutionOptions)
    .values({
      projectId: id,
      name: body.name,
      description: body.description || null,
      pros: body.pros || null,
      cons: body.cons || null,
      feasibilityNotes: body.feasibilityNotes || null,
      createdByAi: Boolean(body.createdByAi),
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
