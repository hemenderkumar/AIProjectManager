import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, syncSubscriptionFromStripe } from "@/lib/billing";

// Inbound webhook from Stripe (distinct from the outbound webhooks feature in
// src/lib/webhooks.ts, which notifies external URLs about Executa events). Public by
// necessity -- Stripe can't authenticate as an Executa user -- so the signature check below
// is the only thing standing between this route and a forged request. Must read the raw
// body (never call req.json() here) since Stripe's signature is computed over the exact
// bytes sent.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscriptionId =
        event.type === "checkout.session.completed"
          ? (event.data.object as Stripe.Checkout.Session).subscription
          : (event.data.object as Stripe.Subscription).id;
      if (typeof subscriptionId === "string") {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await syncSubscriptionFromStripe(subscription);
      } else if (subscriptionId && typeof subscriptionId === "object") {
        await syncSubscriptionFromStripe(subscriptionId as Stripe.Subscription);
      }
      break;
    }
    default:
      // Every other event type (invoices, disputes, etc.) is intentionally ignored --
      // subscriptionStatus only needs to track the subscription lifecycle events above.
      break;
  }

  return NextResponse.json({ received: true });
}
