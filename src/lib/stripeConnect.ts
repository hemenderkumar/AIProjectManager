import { eq } from "drizzle-orm";
import { db } from "./db";
import { organizations } from "./db/schema";
import { getStripe } from "./billing";

// Stripe Connect (Express) onboarding for a company's own payout account. Client invoice
// payments are direct charges on that connected account, so funds never sit in Executa's
// balance. Required env: STRIPE_SECRET_KEY (shared with subscription billing),
// STRIPE_CONNECT_WEBHOOK_SECRET (Connect webhook endpoint), optional STRIPE_CONNECT_FEE_BPS.

export function appUrl(fallbackOrigin?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || "").replace(/\/$/, "");
}

export async function createOnboardingLink(organizationId: string, origin?: string): Promise<string> {
  const stripe = getStripe();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new Error("Organization not found");

  let accountId = org.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      business_profile: { name: org.brandDisplayName?.trim() || org.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { organizationId },
    });
    accountId = account.id;
    await db.update(organizations).set({ stripeConnectAccountId: accountId }).where(eq(organizations.id, organizationId));
  }

  const base = appUrl(origin);
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/organization?connect=refresh`,
    return_url: `${base}/organization?connect=return`,
  });
  return link.url;
}

// Re-reads the account from Stripe and persists whether it can take payments. Called from the
// settings page on return from onboarding and from the account.updated webhook.
export async function syncConnectStatus(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org?.stripeConnectAccountId) return { connected: false, ready: false, detailsSubmitted: false };
  const account = await getStripe().accounts.retrieve(org.stripeConnectAccountId);
  const ready = !!account.charges_enabled && !!account.details_submitted;
  if (ready !== org.stripeConnectReady) {
    await db.update(organizations).set({ stripeConnectReady: ready }).where(eq(organizations.id, organizationId));
  }
  return { connected: true, ready, detailsSubmitted: !!account.details_submitted };
}

export async function syncConnectStatusByAccountId(accountId: string) {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.stripeConnectAccountId, accountId));
  if (org) await syncConnectStatus(org.id);
}
