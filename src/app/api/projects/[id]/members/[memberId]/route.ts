import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params;
  const admin = await requireProjectAccess("PM", id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(projectMembers).where(eq(projectMembers.id, memberId));
  return NextResponse.json({ ok: true });
}
