import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpCriteria } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOwnedRfp } from "@/lib/rfp";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;

  await db.delete(rfpCriteria).where(and(eq(rfpCriteria.id, cid), eq(rfpCriteria.rfpId, id)));
  return NextResponse.json({ ok: true });
}
