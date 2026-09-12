import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRoleMap } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if ("role" in body) update.role = String(body.role ?? "").trim();
  if ("skill" in body) update.skill = String(body.skill ?? "").trim().toLowerCase();

  const [updated] = await db.update(skillRoleMap).set(update).where(eq(skillRoleMap.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.delete(skillRoleMap).where(eq(skillRoleMap.id, id));
  return NextResponse.json({ ok: true });
}
