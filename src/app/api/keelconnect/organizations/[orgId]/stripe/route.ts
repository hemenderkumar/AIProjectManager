import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireScOrgRole } from "@/lib/keelconnect/access";
import { getStripeClient, isStripeConfigured } from "@/lib/keelconnect/stripe";
import { logAudit } from "@/lib/audit";

// Stripe Connect payout status for a Vendor org (#259). Refreshes charges/payouts-enabled
// from Stripe itself (not just the last-known DB flags) so the UI always reflects reality,
// e.g. once a Vendor finishes onboarding on Stripe's own hosted flow.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScOrgRole(orgId, ["VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!org.stripeAccountId) {
    return NextResponse.json({ connected: false, chargesEnabled: false, payoutsEnabled: false, stripeConfigured: isStripeConfigured() });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      connected: true,
      chargesEnabled: org.stripeChargesEnabled,
      payoutsEnabled: org.stripePayoutsEnabled,
      stripeConfigured: false,
    });
  }

  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(org.stripeAccountId);
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    if (chargesEnabled !== org.stripeChargesEnabled || payoutsEnabled !== org.stripePayoutsEnabled) {
      await db.update(scOrganizations).set({ stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled }).where(eq(scOrganizations.id, orgId));
    }
    return NextResponse.json({ connected: true, chargesEnabled, payoutsEnabled, stripeConfigured: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not reach Stripe" }, { status: 502 });
  }
}

// Starts (or resumes) Stripe Standard Connect onboarding for a Vendor org -- returns a
// one-time onboarding link URL for the browser to redirect to. Standard (not Express)
// because Vendor orgs are independent businesses that should manage their own Stripe
// dashboard, tax forms, and payout schedule directly with Stripe -- Keel never touches
// their banking details.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScOrgRole(orgId, ["VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment yet. Ask a Platform Admin to set STRIPE_SECRET_KEY." }, { status: 501 });
  }

  const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (org.orgType !== "VENDOR") return NextResponse.json({ error: "Only Vendor organizations connect a payout account" }, { status: 400 });

  const stripe = getStripeClient();
  let accountId = org.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: ctx.user.email,
      business_type: "company",
      company: { name: org.name },
      metadata: { scOrganizationId: org.id },
    });
    accountId = account.id;
    await db.update(scOrganizations).set({ stripeAccountId: accountId }).where(eq(scOrganizations.id, orgId));
    await logAudit({
      actor: ctx.user,
      action: "keelconnect.organization.stripe_connected",
      entityType: "sc_organization",
      entityId: orgId,
      scOrganizationId: orgId,
      afterValue: JSON.stringify({ stripeAccountId: accountId }),
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/keelconnect/organizations/${orgId}?stripe=refresh`,
    return_url: `${appUrl}/keelconnect/organizations/${orgId}?stripe=return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
