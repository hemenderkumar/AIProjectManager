import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const allowed = ["name", "amount", "cadence", "notes"] as const;
const numericFields = ["amount"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const v = body[key];
    if ((numericFields as readonly string[]).includes(key)) {
      update[key] = v === "" || v === null || Number.isNaN(Number(v)) ? 0 : Number(v);
    } else {
      update[key] = v === "" ? null : v;
    }
  }

  const [updated] = await db
    .update(costItems)
    .set(update)
    .where(and(eq(costItems.id, itemId), eq(costItems.projectId, id)))
    .returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(costItems).where(and(eq(costItems.id, itemId), eq(costItems.projectId, id)));
  return NextResponse.json({ ok: true });
}
