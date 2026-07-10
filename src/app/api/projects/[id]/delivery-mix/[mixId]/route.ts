import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryRoleMix } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

const allowed = ["role", "hours", "onsitePercent", "offshorePercent", "contractorPercent", "rationale"] as const;
const numericFields = ["hours", "onsitePercent", "offshorePercent", "contractorPercent"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mixId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { mixId } = await params;
  const body = await req.json();

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

  const [updated] = await db.update(deliveryRoleMix).set(update).where(eq(deliveryRoleMix.id, mixId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mixId: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { mixId } = await params;
  await db.delete(deliveryRoleMix).where(eq(deliveryRoleMix.id, mixId));
  return NextResponse.json({ ok: true });
}
