import { db } from "./db";
import { promoCodes, promoRedemptions, organizations } from "./db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getStripe } from "./billing";
import type { SessionUser } from "./auth";

export type PromoScope = "SPECIFIC_ORG" | "GROUP" | "GENERIC";
export type PromoDuration = "ONCE" | "REPEATING" | "FOREVER";

// Stripe Promotion Codes are case-sensitive and Stripe itself upper-cases nothing for you --
// two admins typing "launch50" and "LAUNCH50" would silently create two different codes that
// look identical in conversation. Normalizing to upper-case, alphanumeric-plus-dash here (both
// for what we store and what we hand Stripe) means the code an admin sees in the table is
// exactly what a person needs to type, with no case-sensitivity surprises.
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function validatePercentOff(value: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return "Percent off must be a whole number.";
  if (value < 10 || value > 100) return "Percent off must be between 10 and 100.";
  return null;
}

export type CreatePromoInput = {
  code: string;
  percentOff: number;
  scope: PromoScope;
  duration?: PromoDuration;
  durationInMonths?: number | null;
  targetOrganizationId?: string | null; // required for SPECIFIC_ORG
  groupLabel?: string | null; // used for GROUP
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  createdBy?: SessionUser | null;
};

// Creates the real Stripe Coupon + Promotion Code backing this promo, then persists our own
// row. Stripe is the actual enforcement point (redemption counting, expiry, and -- for
// SPECIFIC_ORG -- the customer restriction); our table exists for the admin list and for
// billing.ts to look up "does this org have a standing invite" without an extra Stripe call
// on every checkout attempt.
export async function createPromoCode(input: CreatePromoInput) {
  const code = normalizePromoCode(input.code);
  if (!code) throw new Error("Code is required.");
  const percentError = validatePercentOff(input.percentOff);
  if (percentError) throw new Error(percentError);

  if (input.scope === "SPECIFIC_ORG" && !input.targetOrganizationId) {
    throw new Error("A specific-organization promo needs a target organization.");
  }
  if (input.scope === "GROUP" && !input.groupLabel?.trim()) {
    throw new Error("A group promo needs a group label.");
  }
  const duration = input.duration ?? "ONCE";
  if (duration === "REPEATING" && (!input.durationInMonths || input.durationInMonths < 1)) {
    throw new Error("A repeating promo needs a number of months.");
  }

  const stripe = getStripe();

  const coupon = await stripe.coupons.create({
    percent_off: input.percentOff,
    duration: duration === "ONCE" ? "once" : duration === "FOREVER" ? "forever" : "repeating",
    duration_in_months: duration === "REPEATING" ? input.durationInMonths! : undefined,
    name: code,
  });

  // SPECIFIC_ORG is enforced by Stripe itself, not just by us: the Promotion Code is created
  // with `customer` set to that org's Stripe Customer, so Stripe refuses redemption by anyone
  // else -- the org never has to type a code, and nobody else could use it even if they saw it.
  let stripeCustomerId: string | null = null;
  if (input.scope === "SPECIFIC_ORG" && input.targetOrganizationId) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, input.targetOrganizationId));
    if (!org) throw new Error("Target organization not found.");
    stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ name: org.name, metadata: { organizationId: org.id } });
      stripeCustomerId = customer.id;
      await db.update(organizations).set({ stripeCustomerId }).where(eq(organizations.id, org.id));
    }
  }

  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
    active: true,
    customer: stripeCustomerId ?? undefined,
    max_redemptions: input.maxRedemptions ?? undefined,
    expires_at: input.expiresAt ? Math.floor(input.expiresAt.getTime() / 1000) : undefined,
  });

  const [created] = await db
    .insert(promoCodes)
    .values({
      code,
      percentOff: input.percentOff,
      scope: input.scope,
      duration,
      durationInMonths: duration === "REPEATING" ? input.durationInMonths : null,
      targetOrganizationId: input.scope === "SPECIFIC_ORG" ? input.targetOrganizationId : null,
      groupLabel: input.scope === "GROUP" ? input.groupLabel?.trim() : null,
      maxRedemptions: input.maxRedemptions ?? null,
      expiresAt: input.expiresAt ?? null,
      stripeCouponId: coupon.id,
      stripePromotionCodeId: promotionCode.id,
      createdBy: input.createdBy?.name ?? null,
    })
    .returning();

  return created;
}

export async function listPromoCodes() {
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

// Deactivating is the only lifecycle action -- Stripe coupons/promotion codes can't be hard
// deleted once created (they may already be referenced by past invoices), so "delete" would be
// misleading. active:false on the Stripe Promotion Code immediately blocks new redemptions;
// anyone already subscribed under it keeps their existing discount, same as any real coupon.
export async function setPromoCodeActive(id: string, isActive: boolean) {
  const [existing] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
  if (!existing) throw new Error("Promo code not found.");
  if (existing.stripePromotionCodeId) {
    await getStripe().promotionCodes.update(existing.stripePromotionCodeId, { active: isActive });
  }
  const [updated] = await db.update(promoCodes).set({ isActive }).where(eq(promoCodes.id, id)).returning();
  return updated;
}

// The SPECIFIC_ORG auto-apply lookup billing.ts uses at checkout time -- pure DB read, no
// Stripe call, so it's cheap to check on every checkout attempt. Only returns a promo that's
// still active, not expired, and hasn't hit its own redemption cap (belt-and-suspenders on top
// of Stripe's own enforcement, so we never even attempt to apply a dead code).
export async function findActiveSpecificPromoForOrg(organizationId: string) {
  const rows = await db
    .select()
    .from(promoCodes)
    .where(and(eq(promoCodes.targetOrganizationId, organizationId), eq(promoCodes.scope, "SPECIFIC_ORG"), eq(promoCodes.isActive, true)));
  const now = Date.now();
  return (
    rows.find((p) => {
      if (p.expiresAt && p.expiresAt.getTime() < now) return false;
      if (p.maxRedemptions != null && p.redemptionCount >= p.maxRedemptions) return false;
      return true;
    }) ?? null
  );
}

// Called from the Stripe webhook once a checkout session with an applied promotion code
// completes. Best-effort by design (wrapped in try/catch at the call site) -- a bookkeeping
// failure here must never roll back or block the subscription itself from activating.
export async function recordPromoRedemption(params: {
  stripePromotionCodeId: string;
  organizationId: string | null;
  organizationName: string | null;
  stripeCheckoutSessionId: string;
  stripeSubscriptionId: string | null;
}) {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.stripePromotionCodeId, params.stripePromotionCodeId));
  if (!promo) return;
  await db.insert(promoRedemptions).values({
    promoCodeId: promo.id,
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    stripeCheckoutSessionId: params.stripeCheckoutSessionId,
    stripeSubscriptionId: params.stripeSubscriptionId,
  });
  await db.update(promoCodes).set({ redemptionCount: promo.redemptionCount + 1 }).where(eq(promoCodes.id, promo.id));
}

export async function listPromoRedemptions(promoCodeId: string) {
  return db.select().from(promoRedemptions).where(eq(promoRedemptions.promoCodeId, promoCodeId)).orderBy(desc(promoRedemptions.redeemedAt));
}
