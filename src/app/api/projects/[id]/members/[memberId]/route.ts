import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const admin = await requireRole("PM");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { memberId } = await params;
  await db.delete(projectMembers).where(eq(projectMembers.id, memberId));
  return NextResponse.json({ ok: true });
}
