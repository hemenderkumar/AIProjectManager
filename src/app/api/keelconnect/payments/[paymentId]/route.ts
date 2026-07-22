import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scPayments, scMilestones, scAgreementParties, scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScPayment, requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";
import { notifyScOrg } from "@/lib/keelconnect/notify";
import { getStripeClient, isStripeConfigured } from "@/lib/keelconnect/stripe";

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

  // Real money movement (#259): if this payment was actually captured via Stripe
  // (stripePaymentIntentId set) and Stripe is configured on this deployment, RELEASED and
  // REFUNDED perform a real Stripe Transfer/Refund before the DB is updated -- a failure here
  // aborts the whole PATCH rather than silently marking money "released" that never moved.
  // A payment that predates Stripe (or was raised on a deployment without Stripe configured)
  // falls back to the original ledger-only transition, which is what a design-partner pilot
  // running on an internal ledger still needs.
  const patch: Record<string, unknown> = { status: body.status };

  if (body.status === "RELEASED" && before.stripePaymentIntentId && isStripeConfigured()) {
    const [milestone] = await db.select().from(scMilestones).where(eq(scMilestones.id, before.scMilestoneId));
    const parties = milestone ? await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, milestone.scAgreementId)) : [];
    const vendorOrgId = parties.find((p) => p.partyRole === "VENDOR")?.scOrganizationId;
    const [vendorOrg] = vendorOrgId ? await db.select().from(scOrganizations).where(eq(scOrganizations.id, vendorOrgId)) : [];
    if (!vendorOrg?.stripeAccountId) {
      return NextResponse.json({ error: "The vendor hasn't connected a Stripe payout account yet" }, { status: 400 });
    }
    try {
      const stripe = getStripeClient();
      const transfer = await stripe.transfers.create({
        amount: Math.round(before.amount * 100),
        currency: before.currency.toLowerCase(),
        destination: vendorOrg.stripeAccountId,
        transfer_group: before.id,
      });
      patch.stripeTransferId = transfer.id;
    } catch (err) {
      return NextResponse.json({ error: `Stripe transfer failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
    }
  }

  if (body.status === "REFUNDED" && before.stripePaymentIntentId && isStripeConfigured()) {
    try {
      const stripe = getStripeClient();
      const refund = await stripe.refunds.create({ payment_intent: before.stripePaymentIntentId });
      patch.stripeRefundId = refund.id;
    } catch (err) {
      return NextResponse.json({ error: `Stripe refund failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
    }
  }

  const [updated] = await db.update(scPayments).set(patch).where(eq(scPayments.id, paymentId)).returning();

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

  if (body.status === "RELEASED" || body.status === "REFUNDED") {
    const [milestone] = await db.select().from(scMilestones).where(eq(scMilestones.id, before.scMilestoneId));
    if (milestone) {
      const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, milestone.scAgreementId));
      const vendorOrgId = parties.find((p) => p.partyRole === "VENDOR")?.scOrganizationId;
      const clientOrgId = parties.find((p) => p.partyRole === "CLIENT")?.scOrganizationId;
      if (body.status === "RELEASED") {
        notifyScOrg(
          vendorOrgId,
          "Payment released",
          `A payment of ${updated.currency} ${updated.amount.toLocaleString()} has been released to your organization on KeelConnect.`,
          ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"]
        ).catch(() => {});
      } else {
        notifyScOrg(
          clientOrgId,
          "Payment refunded",
          `A payment of ${updated.currency} ${updated.amount.toLocaleString()} on KeelConnect has been refunded to your organization.`,
          ["CLIENT_ORG_ADMIN", "CLIENT_FINANCE_APPROVER"]
        ).catch(() => {});
      }
    }
  }

  return NextResponse.json(updated);
}
