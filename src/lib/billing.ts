import Stripe from "stripe";
import { db } from "./db";
import { organizations, plans, settings, users, projects } from "./db/schema";
import { eq, and, ne } from "drizzle-orm";

// Lazily constructed -- STRIPE_SECRET_KEY only needs to exist once someone actually tries to
// check out or open the billing portal, not for every request that merely checks trial status
// (isOrgBillingBlocked below never touches Stripe at all). Throwing here rather than at module
// load keeps the rest of the app working even before Stripe is configured.
let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  stripeClient = new Stripe(key);
  return stripeClient;
}

// Reads the admin-configurable trial length (Admin > Automation settings). Falls back to 14
// if the singleton settings row hasn't been created yet (mirrors the fallback pattern already
// used by /api/admin/settings).
export async function getTrialDays(): Promise<number> {
  const [row] = await db.select({ trialDays: settings.trialDays }).from(settings).where(eq(settings.id, "default"));
  return row?.trialDays ?? 14;
}

export async function trialEndDate(): Promise<Date> {
  const days = await getTrialDays();
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// The single source of truth for "is this org locked out of the app." Internal Executa staff
// (organizationId null) are never blocked -- billing only applies to client organizations.
// An org is unblocked if: an admin has comped it, its subscription is genuinely ACTIVE via
// Stripe, or its trial hasn't expired yet (or it has no trialEndsAt at all -- e.g. an org
// created by direct DB action, or grandfathered pre-billing orgs, which the migration backfills
// to ACTIVE anyway). Everything else (TRIALING-but-expired, PAST_DUE, CANCELED) is blocked.
export async function isOrgBillingBlocked(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const [org] = await db
    .select({
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      billingCompedByAdmin: organizations.billingCompedByAdmin,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) return false;
  if (org.billingCompedByAdmin) return false;
  if (org.subscriptionStatus === "ACTIVE") return false;
  if (!org.trialEndsAt) return false;
  return org.trialEndsAt.getTime() < Date.now();
}

// Same check but resolved by user id -- convenient for call sites that only have the session
// user, not the raw organizationId, on hand.
export async function isUserBillingBlocked(userId: string): Promise<boolean> {
  const [row] = await db.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, userId));
  return isOrgBillingBlocked(row?.organizationId ?? null);
}

export async function listActivePlans() {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.sortOrder);
}

// Creates (or reuses) the Stripe Customer for this org, then a Checkout session for the given
// plan's price. The org's stripeCustomerId is persisted on first checkout so future sessions
// (and the webhook handler) can always find the org from a Stripe customer/subscription id.
export async function createCheckoutSession(params: {
  organizationId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}) {
  const stripe = getStripe();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, params.organizationId));
  if (!org) throw new Error("Organization not found");
  const [plan] = await db.select().from(plans).where(eq(plans.id, params.planId));
  if (!plan) throw new Error("Plan not found");
  if (!plan.stripePriceId) throw new Error("This plan isn't connected to a Stripe price yet.");

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: params.customerEmail,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await db.update(organizations).set({ stripeCustomerId: customerId }).where(eq(organizations.id, org.id));
  }

  // Per-seat plans bill for however many active users the org has right now (min 1) --
  // Stripe applies whatever volume/graduated discount curve the admin configured on the
  // Price itself, so a 50-seat org can cost less per seat than a 5-seat one without any
  // tier-breakpoint logic on our side.
  const quantity = plan.billingModel === "per_seat" ? Math.max(1, await countActiveSeats(org.id)) : 1;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { organizationId: org.id, planId: plan.id },
    subscription_data: { metadata: { organizationId: org.id, planId: plan.id } },
  });
  return session;
}

async function countActiveSeats(organizationId: string): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.organizationId, organizationId));
  return rows.length;
}

export type PlanLimitCheck = { allowed: boolean; limit: number | null; current: number; planName: string | null };

// Enforces plans.seatLimit / plans.projectLimit -- both fields have existed on the plans table
// since the billing schema landed, but nothing actually checked them until now. Orgs with no
// plan selected (still on trial, or comped without ever picking a tier) have no limit: this
// only kicks in once an org is on a real metered plan, so it never blocks anyone mid-trial.
// `kind` "seat" reuses the exact same count per-seat billing already bills on (countActiveSeats);
// "project" counts non-CLOSED projects only, so completed/archived work never counts against a
// live cap.
async function countActiveProjects(organizationId: string): Promise<number> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), ne(projects.stage, "CLOSED")));
  return rows.length;
}

export async function checkPlanLimit(organizationId: string, kind: "seat" | "project"): Promise<PlanLimitCheck> {
  const current = kind === "seat" ? await countActiveSeats(organizationId) : await countActiveProjects(organizationId);

  const [org] = await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org?.planId) return { allowed: true, limit: null, current, planName: null };
  const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
  if (!plan) return { allowed: true, limit: null, current, planName: null };

  const limit = kind === "seat" ? plan.seatLimit : plan.projectLimit;
  if (limit == null) return { allowed: true, limit: null, current, planName: plan.name };

  return { allowed: current < limit, limit, current, planName: plan.name };
}

// Keeps an existing per-seat subscription's quantity in step with the org's actual user
// count -- call this (best-effort, never block on it) whenever a user is added to or removed
// from an org that's on a per_seat plan and already has a live Stripe subscription. Flat-plan
// orgs and orgs without an active subscription are no-ops.
export async function syncSeatQuantity(organizationId: string) {
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org?.stripeSubscriptionId || !org.planId) return;
    const [plan] = await db.select().from(plans).where(eq(plans.id, org.planId));
    if (plan?.billingModel !== "per_seat") return;

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) return;
    const quantity = Math.max(1, await countActiveSeats(organizationId));
    if (item.quantity === quantity) return;
    await stripe.subscriptionItems.update(item.id, { quantity });
  } catch {
    // Best-effort -- a sync failure here shouldn't block the user create/remove action that
    // triggered it. The webhook-driven syncSubscriptionFromStripe stays the source of truth
    // and will reconcile on the next Stripe-initiated event regardless.
  }
}

export async function createPortalSession(organizationId: string, returnUrl: string) {
  const stripe = getStripe();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org?.stripeCustomerId) throw new Error("No billing account yet -- subscribe first.");
  return stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: returnUrl });
}

// Maps a Stripe subscription status to ours. Stripe has more granularity (trialing, incomplete,
// incomplete_expired, unpaid...) than we need to distinguish in the UI -- everything that isn't
// clearly "still paying" or "definitely gone" collapses to PAST_DUE so the org gets a chance to
// fix payment before being fully canceled.
function mapStripeStatus(status: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "canceled" || status === "incomplete_expired") return "CANCELED";
  return "PAST_DUE";
}

// Called from /api/webhooks/stripe for every subscription-lifecycle event. Keeps
// organizations.subscriptionStatus/stripeSubscriptionId/planId in sync with Stripe -- this is
// the only place that ever writes those three fields on behalf of a real payment (as opposed
// to the admin comp override, which is a separate flag entirely).
export async function syncSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;
  const priceId = subscription.items.data[0]?.price?.id;
  let planId: string | null = null;
  if (priceId) {
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.stripePriceId, priceId));
    planId = plan?.id ?? null;
  }
  await db
    .update(organizations)
    .set({
      subscriptionStatus: mapStripeStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      planId,
    })
    .where(eq(organizations.id, organizationId));
}
