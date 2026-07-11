import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; allocationId: string }> }
) {
  const { id, allocationId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const { id, allocationId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(projectResources).where(eq(projectResources.id, allocationId));
  return NextResponse.json({ ok: true });
}
