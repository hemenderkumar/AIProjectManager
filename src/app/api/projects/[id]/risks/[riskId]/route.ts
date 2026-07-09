import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; riskId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { riskId } = await params;
  const body = await req.json();
  const allowed = ["description", "impact", "likelihood", "mitigation", "owner", "status"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) update[key] = body[key];

  const [updated] = await db.update(riskItems).set(update).where(eq(riskItems.id, riskId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; riskId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { riskId } = await params;
  await db.delete(riskItems).where(eq(riskItems.id, riskId));
  return NextResponse.json({ ok: true });
}
