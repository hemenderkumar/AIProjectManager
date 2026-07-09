import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; allocationId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { allocationId } = await params;
  const body = await req.json();
  const [updated] = await db
    .update(projectResources)
    .set({ allocationPercent: body.allocationPercent })
    .where(eq(projectResources.id, allocationId))
    .returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; allocationId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { allocationId } = await params;
  await db.delete(projectResources).where(eq(projectResources.id, allocationId));
  return NextResponse.json({ ok: true });
}
