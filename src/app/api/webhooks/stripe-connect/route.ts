import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientInvoices, organizations, projects } from "@/lib/db/schema";
import { getStripe } from "@/lib/billing";
import { syncConnectStatusByAccountId } from "@/lib/stripeConnect";
import { formatMoney } from "@/lib/clientInvoices";
import { notifyDeliveryTeam } from "@/lib/deliverableReview";
import { logAudit } from "@/lib/audit";

// Inbound webhook for events on CONNECTED accounts (register this endpoint in Stripe as a
// "Connect" webhook; it has its own signing secret, STRIPE_CONNECT_WEBHOOK_SECRET). Verified by
// signature -- the only thing authenticating this public route. Marking an invoice paid is
// idempotent (conditional UPDATE) so Stripe retries and the async ACH success event are safe.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 400 },
    );
  }

  const accountId = event.account ?? null;

  if (event.type === "account.updated" && accountId) {
    await syncConnectStatusByAccountId(accountId);
    return NextResponse.json({ received: true });
  }

  if (
    (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
    accountId
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.clientInvoiceId;
    // ACH: "completed" fires with payment_status "unpaid" until funds clear; the async_payment_succeeded
    // event follows. Only a "paid" session settles the invoice.
    if (!invoiceId || session.payment_status !== "paid") return NextResponse.json({ received: true });

    const [inv] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, invoiceId));
    if (!inv) return NextResponse.json({ received: true });

    // The event must come from THIS invoice's organization's connected account -- a different
    // connected account can't mark someone else's invoice paid by guessing an id.
    const [org] = await db.select().from(organizations).where(eq(organizations.id, inv.organizationId));
    if (!org || org.stripeConnectAccountId !== accountId) return NextResponse.json({ received: true });
    if ((session.amount_total ?? -1) !== inv.amountCents) return NextResponse.json({ received: true });

    let paymentMethod: string | null = null;
    let receiptUrl: string | null = null;
    const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    if (piId) {
      try {
        const pi = await getStripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] }, { stripeAccount: accountId });
        const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
        paymentMethod = charge?.payment_method_details?.type ?? null;
        receiptUrl = charge?.receipt_url ?? null;
      } catch {
        // Receipt details are cosmetic; the payment itself is already confirmed by the event.
      }
    }

    const [marked] = await db
      .update(clientInvoices)
      .set({
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: piId,
        stripeCheckoutSessionId: session.id,
        paymentMethod,
        receiptUrl,
      })
      .where(and(eq(clientInvoices.id, invoiceId), ne(clientInvoices.status, "PAID")))
      .returning();

    if (marked) {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId));
      await logAudit({
        actor: null,
        action: "client_invoice.paid",
        entityType: "client_invoice",
        entityId: invoiceId,
        detail: `Invoice ${inv.number} (${formatMoney(inv.amountCents, inv.currency)}) was paid online.`,
      }).catch(() => {});
      await notifyDeliveryTeam({
        projectId: inv.projectId,
        actor: { id: "system", name: "System", email: "", role: "VIEWER", organizationId: null },
        title: `Invoice ${inv.number} paid`,
        body: `${formatMoney(inv.amountCents, inv.currency)} received for ${proj?.name ?? "your project"}.`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
