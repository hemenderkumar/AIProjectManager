import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createMockDb } = await import("./mockDb");
  const instance = createMockDb();
  (globalThis as Record<string, unknown>).__testMockDb = instance;
  return { db: instance.db };
});

function queueResult(rows: Record<string, unknown>[]) {
  (globalThis as { __testMockDb?: { queueResult: (rows: Record<string, unknown>[]) => void } }).__testMockDb!.queueResult(rows);
}

import { normalizePromoCode, validatePercentOff, findActiveSpecificPromoForOrg } from "@/lib/promo";

// normalizePromoCode is what makes "launch50", "Launch50 ", and "LAUNCH-50!" all resolve
// predictably -- both what we store and what we hand Stripe, so a mismatch here means a code
// an admin created doesn't match what a person actually types.
describe("normalizePromoCode", () => {
  it("upper-cases and trims", () => {
    expect(normalizePromoCode("  launch50 ")).toBe("LAUNCH50");
  });

  it("strips characters outside A-Z, 0-9, and dash", () => {
    expect(normalizePromoCode("launch!50%off")).toBe("LAUNCH50OFF");
  });

  it("keeps dashes", () => {
    expect(normalizePromoCode("beta-partner-2026")).toBe("BETA-PARTNER-2026");
  });
});

// validatePercentOff enforces the 10-100 range the feature was scoped to -- a promo below 10%
// or above 100% should never reach Stripe.
describe("validatePercentOff", () => {
  it("accepts the boundary values", () => {
    expect(validatePercentOff(10)).toBeNull();
    expect(validatePercentOff(100)).toBeNull();
  });

  it("rejects below 10", () => {
    expect(validatePercentOff(9)).not.toBeNull();
  });

  it("rejects above 100", () => {
    expect(validatePercentOff(101)).not.toBeNull();
  });

  it("rejects non-integers", () => {
    expect(validatePercentOff(50.5)).not.toBeNull();
  });
});

// findActiveSpecificPromoForOrg is what createCheckoutSession (billing.ts) relies on to decide
// whether to auto-apply a personal invite -- a bug here either silently fails to give someone
// their promised discount, or (worse) keeps offering an expired/exhausted one.
describe("findActiveSpecificPromoForOrg", () => {
  it("returns null when the org has no specific promo", async () => {
    queueResult([]);
    const result = await findActiveSpecificPromoForOrg("org_a");
    expect(result).toBeNull();
  });

  it("returns an active, unexpired, unexhausted promo", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    queueResult([{ id: "promo_1", expiresAt: future, maxRedemptions: 5, redemptionCount: 1 }]);
    const result = await findActiveSpecificPromoForOrg("org_a");
    expect(result?.id).toBe("promo_1");
  });

  it("skips a promo that has already expired", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    queueResult([{ id: "promo_1", expiresAt: past, maxRedemptions: null, redemptionCount: 0 }]);
    const result = await findActiveSpecificPromoForOrg("org_a");
    expect(result).toBeNull();
  });

  it("skips a promo that has hit its redemption cap", async () => {
    queueResult([{ id: "promo_1", expiresAt: null, maxRedemptions: 1, redemptionCount: 1 }]);
    const result = await findActiveSpecificPromoForOrg("org_a");
    expect(result).toBeNull();
  });

  it("has no cap or expiry means always eligible", async () => {
    queueResult([{ id: "promo_1", expiresAt: null, maxRedemptions: null, redemptionCount: 0 }]);
    const result = await findActiveSpecificPromoForOrg("org_a");
    expect(result?.id).toBe("promo_1");
  });
});
