import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scPayments, scOrganizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "@/lib/keelconnect/stripe";
import { autoVerifyComplianceFromStripe } from "@/lib/keelconnect/complianceAutoVerify";
import { logAudit } from "@/lib/audit";
import Stripe from "stripe";

// Stripe webhook (#259) -- no session/auth, verified purely by the signature header against
// STRIPE_WEBHOOK_SECRET (standard Stripe pattern). Handles the two events this integration
// actually needs: checkout.session.completed (a Client's payment cleared -> mark the
// matching sc_payment HELD, escrowed on the Platform's balance) and account.updated (a
// Vendor's Connect onboarding status changed -> refresh their charges/payouts-enabled flags,
// and once both are true, auto-verify the compliance records Stripe's own underwriting
// already covers -- see lib/keelconnect/complianceAutoVerify.ts). Every other event type is
// accepted and ignored, not rejected, per Stripe's own guidance for forward-compatibility.
export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured on this deployment" }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const scPaymentId = session.metadata?.scPaymentId;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (scPaymentId) {
      // Idempotent: only ever moves a PENDING payment to HELD, so a duplicate delivery of
      // this same event (Stripe retries webhooks) can't double-apply.
      const [updated] = await db
        .update(scPayments)
        .set({ status: "HELD", stripePaymentIntentId: paymentIntentId ?? null })
        .where(and(eq(scPayments.id, scPaymentId), eq(scPayments.status, "PENDING")))
        .returning();
      if (updated) {
        await logAudit({
          actor: null,
          action: "keelconnect.payment.stripe_captured",
          entityType: "sc_payment",
          entityId: scPaymentId,
          afterValue: JSON.stringify({ status: "HELD", stripePaymentIntentId: paymentIntentId }),
        });
      }
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.stripeAccountId, account.id));
    if (org) {
      const chargesEnabled = !!account.charges_enabled;
      const payoutsEnabled = !!account.payouts_enabled;
      await db
        .update(scOrganizations)
        .set({ stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled })
        .where(eq(scOrganizations.id, org.id));

      // Stripe only reaches this fully-enabled state after completing its own business
      // verification, identity, and sanctions/risk screening -- treat that as satisfying
      // Keel's own KYB/KYC/Tax Form/Sanctions Screening compliance records (never the org's
      // overall "Verified" badge, which stays a human compliance-officer decision). See
      // lib/keelconnect/complianceAutoVerify.ts for exactly what this does and doesn't touch.
      if (chargesEnabled && payoutsEnabled) {
        await autoVerifyComplianceFromStripe(org.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
