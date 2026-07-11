import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const allowed = ["role", "sourcingType", "hourlyRate", "notes"] as const;
const numericFields = ["hourlyRate"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireInternal("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const [before] = await db.select({ hourlyRate: rateCards.hourlyRate, role: rateCards.role }).from(rateCards).where(eq(rateCards.id, id));

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

  const [updated] = await db.update(rateCards).set(update).where(eq(rateCards.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (before && before.hourlyRate !== updated.hourlyRate) {
    await logAudit({
      actor: _authUser, action: "rate_card.updated", entityType: "rate_card", entityId: id,
      detail: `${_authUser.name} changed the ${updated.role} rate from $${before.hourlyRate}/hr to $${updated.hourlyRate}/hr.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireInternal("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.delete(rateCards).where(eq(rateCards.id, id));
  return NextResponse.json({ ok: true });
}
