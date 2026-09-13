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

import { isOrgBillingBlocked } from "@/lib/billing";

// isOrgBillingBlocked is the single gate deciding whether a client org is locked out of the
// app (see the comment on it in billing.ts). Getting any branch wrong either locks out a
// paying customer or lets an expired/canceled org keep using the product for free.
describe("isOrgBillingBlocked", () => {
  it("internal staff (no organizationId) are never blocked -- no query needed", async () => {
    await expect(isOrgBillingBlocked(null)).resolves.toBe(false);
  });

  it("an org that can't be found at all is not blocked", async () => {
    queueResult([]);
    await expect(isOrgBillingBlocked("org_missing")).resolves.toBe(false);
  });

  it("an admin-comped org is never blocked, regardless of subscription/trial state", async () => {
    queueResult([{ subscriptionStatus: "CANCELED", trialEndsAt: new Date("2020-01-01"), billingCompedByAdmin: true }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(false);
  });

  it("a genuinely ACTIVE Stripe subscription is not blocked", async () => {
    queueResult([{ subscriptionStatus: "ACTIVE", trialEndsAt: null, billingCompedByAdmin: false }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(false);
  });

  it("no trialEndsAt at all (grandfathered/pre-billing org) is not blocked", async () => {
    queueResult([{ subscriptionStatus: "PAST_DUE", trialEndsAt: null, billingCompedByAdmin: false }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(false);
  });

  it("still within an unexpired trial is not blocked", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    queueResult([{ subscriptionStatus: "PAST_DUE", trialEndsAt: future, billingCompedByAdmin: false }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(false);
  });

  it("an expired trial with no active subscription is blocked", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    queueResult([{ subscriptionStatus: "PAST_DUE", trialEndsAt: past, billingCompedByAdmin: false }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(true);
  });

  it("a CANCELED subscription past its trial end is blocked", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    queueResult([{ subscriptionStatus: "CANCELED", trialEndsAt: past, billingCompedByAdmin: false }]);
    await expect(isOrgBillingBlocked("org_a")).resolves.toBe(true);
  });
});
