import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brainstormEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(brainstormEntries).where(eq(brainstormEntries.id, entryId));
  return NextResponse.json({ ok: true });
}
