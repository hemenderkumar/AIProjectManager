import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRateCardAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const allowed = ["role", "sourcingType", "hourlyRate", "notes"] as const;
const numericFields = ["hourlyRate"] as const;

// A caller only ever has one scope (ADMIN aside): a specific company's rows, or the global
// list. This confirms the row being touched actually belongs to that scope before allowing
// the edit/delete — without it, a SUPER_USER could PATCH another company's rate card by id
// even though the GET/POST routes would never have shown it to them in the first place.
async function assertOwnsRow(
  access: NonNullable<Awaited<ReturnType<typeof requireRateCardAccess>>>,
  id: string
): Promise<boolean> {
  if (access.scope.kind === "ALL") return true;
  const [row] = await db.select({ organizationId: rateCards.organizationId }).from(rateCards).where(eq(rateCards.id, id));
  if (!row) return false;
  return row.organizationId === access.scope.organizationId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireRateCardAccess("CONTRIBUTOR");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await assertOwnsRow(access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
      actor: access.user, action: "rate_card.updated", entityType: "rate_card", entityId: id,
      organizationId: updated.organizationId,
      detail: `${access.user.name} changed the ${updated.role} rate from $${before.hourlyRate}/hr to $${updated.hourlyRate}/hr.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireRateCardAccess("CONTRIBUTOR");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await assertOwnsRow(access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(rateCards).where(eq(rateCards.id, id));
  return NextResponse.json({ ok: true });
}
