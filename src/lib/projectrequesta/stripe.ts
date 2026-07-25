import Stripe from "stripe";

// Real payments (#259) via Stripe Connect -- "separate charges and transfers": a Client's
// Checkout Session captures funds onto the Platform's own Stripe balance, and releasing a
// payment issues a real Transfer to the Vendor's connected account. This requires
// STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook route) to be set in the
// deployment environment -- there is no working Stripe integration in a sandbox/demo
// environment without real API keys. getStripeClient() throws a clear, catchable error
// rather than crashing at import time, so every route calling it can surface "payments
// aren't configured yet" instead of a raw 500.
let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured on this deployment (STRIPE_SECRET_KEY is unset).");
  }
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cached;
}
