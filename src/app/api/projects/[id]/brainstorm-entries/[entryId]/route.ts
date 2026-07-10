import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brainstormEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { entryId } = await params;
  await db.delete(brainstormEntries).where(eq(brainstormEntries.id, entryId));
  return NextResponse.json({ ok: true });
}
