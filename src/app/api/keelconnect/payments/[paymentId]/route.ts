import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scPayments, scMilestones } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScPayment, requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScPayment(user, paymentId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [payment] = await db.select().from(scPayments).where(eq(scPayments.id, paymentId));
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(payment);
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["HELD", "REFUNDED"],
  HELD: ["RELEASED", "REFUNDED"],
};

// Platform Admin only -- Keel is the party actually moving money (or standing behind an
// escrow-style hold) in both engagement models, so status transitions here are never
// self-serve for Client or Vendor. Releasing a payment also marks its Milestone PAID, so the
// two states can't drift out of sync.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const ctx = await requireScPlatform(["PLATFORM_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(scPayments).where(eq(scPayments.id, paymentId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!VALID_TRANSITIONS[before.status]?.includes(body.status)) {
    return NextResponse.json({ error: `Cannot move payment from ${before.status} to ${body.status}` }, { status: 400 });
  }

  const [updated] = await db.update(scPayments).set({ status: body.status }).where(eq(scPayments.id, paymentId)).returning();

  if (body.status === "RELEASED") {
    await db.update(scMilestones).set({ status: "PAID" }).where(eq(scMilestones.id, before.scMilestoneId));
  }

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.payment.status_changed",
    entityType: "sc_payment",
    entityId: paymentId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}
