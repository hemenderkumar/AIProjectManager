import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prPayments, prOrganizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, isStripeConfigured } from "@/lib/projectrequesta/stripe";
import { autoVerifyComplianceFromStripe } from "@/lib/projectrequesta/complianceAutoVerify";
import { logAudit } from "@/lib/audit";
import Stripe from "stripe";

// Stripe webhook (#259) -- no session/auth, verified purely by the signature header against
// STRIPE_WEBHOOK_SECRET (standard Stripe pattern). Handles the two events this integration
// actually needs: checkout.session.completed (a Client's payment cleared -> mark the
// matching pr_payment HELD, escrowed on the Platform's balance) and account.updated (a
// Vendor's Connect onboarding status changed -> refresh their charges/payouts-enabled flags,
// and once both are true, auto-verify the compliance records Stripe's own underwriting
// already covers -- see lib/projectrequesta/complianceAutoVerify.ts). Every other event type is
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
    const prPaymentId = session.metadata?.prPaymentId;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (prPaymentId) {
      // Idempotent: only ever moves a PENDING payment to HELD, so a duplicate delivery of
      // this same event (Stripe retries webhooks) can't double-apply.
      const [updated] = await db
        .update(prPayments)
        .set({ status: "HELD", stripePaymentIntentId: paymentIntentId ?? null })
        .where(and(eq(prPayments.id, prPaymentId), eq(prPayments.status, "PENDING")))
        .returning();
      if (updated) {
        await logAudit({
          actor: null,
          action: "projectrequesta.payment.stripe_captured",
          entityType: "pr_payment",
          entityId: prPaymentId,
          afterValue: JSON.stringify({ status: "HELD", stripePaymentIntentId: paymentIntentId }),
        });
      }
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const [org] = await db.select().from(prOrganizations).where(eq(prOrganizations.stripeAccountId, account.id));
    if (org) {
      const chargesEnabled = !!account.charges_enabled;
      const payoutsEnabled = !!account.payouts_enabled;
      await db
        .update(prOrganizations)
        .set({ stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled })
        .where(eq(prOrganizations.id, org.id));

      // Stripe only reaches this fully-enabled state after completing its own business
      // verification, identity, and sanctions/risk screening -- treat that as satisfying
      // Executa's own KYB/KYC/Tax Form/Sanctions Screening compliance records (never the org's
      // overall "Verified" badge, which stays a human compliance-officer decision). See
      // lib/projectrequesta/complianceAutoVerify.ts for exactly what this does and doesn't touch.
      if (chargesEnabled && payoutsEnabled) {
        await autoVerifyComplianceFromStripe(org.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
