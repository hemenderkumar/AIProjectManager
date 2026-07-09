import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await db
    .select({ id: projectMembers.id, userId: users.id, name: users.name, email: users.email, role: users.role })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, id));
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("PM");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const [created] = await db
    .insert(projectMembers)
    .values({ projectId: id, userId: body.userId })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
