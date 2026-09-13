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

import { validateExpenseInput, getMrrSummary, getOrgStatusCounts } from "@/lib/finance";

// validateExpenseInput is the only thing standing between a bad admin input (a negative
// amount, an unknown category) and a corrupted business-expense ledger -- since this ledger
// feeds directly into the profitability report.
describe("validateExpenseInput", () => {
  it("accepts a valid expense", () => {
    expect(validateExpenseInput({ category: "PAYROLL", payeeName: "Jane Doe", amountCents: 500000 })).toBeNull();
  });

  it("rejects an unknown category", () => {
    expect(validateExpenseInput({ category: "NOT_REAL" as never, payeeName: "Jane", amountCents: 100 })).not.toBeNull();
  });

  it("rejects an empty payee name", () => {
    expect(validateExpenseInput({ category: "OTHER", payeeName: "   ", amountCents: 100 })).not.toBeNull();
  });

  it("rejects a zero or negative amount", () => {
    expect(validateExpenseInput({ category: "OTHER", payeeName: "Vendor", amountCents: 0 })).not.toBeNull();
    expect(validateExpenseInput({ category: "OTHER", payeeName: "Vendor", amountCents: -500 })).not.toBeNull();
  });
});

// getMrrSummary is what the finance dashboard's headline number comes from -- getting the
// "genuinely paying" filter wrong either overstates MRR (counting comped/grandfathered orgs
// that pay nothing) or understates it (missing a real per-seat subscriber).
describe("getMrrSummary", () => {
  it("excludes orgs with no plan from MRR", async () => {
    queueResult([{ id: "org_a", planId: null }]); // payingOrgs
    queueResult([]); // plans
    const result = await getMrrSummary();
    expect(result.mrrCents).toBe(0);
    expect(result.payingOrgCount).toBe(0);
  });

  it("sums a flat monthly plan for a single org", async () => {
    queueResult([{ id: "org_a", planId: "plan_1" }]);
    queueResult([{ id: "plan_1", name: "Pro", priceCents: 4900, billingInterval: "month", billingModel: "flat" }]);
    const result = await getMrrSummary();
    expect(result.mrrCents).toBe(4900);
    expect(result.arrCents).toBe(4900 * 12);
    expect(result.payingOrgCount).toBe(1);
  });

  it("normalizes an annual plan to a monthly figure", async () => {
    queueResult([{ id: "org_a", planId: "plan_1" }]);
    queueResult([{ id: "plan_1", name: "Pro Annual", priceCents: 120000, billingInterval: "year", billingModel: "flat" }]);
    const result = await getMrrSummary();
    expect(result.mrrCents).toBe(10000); // 120000 / 12
  });

  it("multiplies a per-seat plan by the org's active seat count", async () => {
    queueResult([{ id: "org_a", planId: "plan_1" }]); // payingOrgs
    queueResult([{ id: "plan_1", name: "Team", priceCents: 1000, billingInterval: "month", billingModel: "per_seat" }]); // plans
    queueResult([{ organizationId: "org_a" }, { organizationId: "org_a" }, { organizationId: "org_a" }]); // users -- 3 seats
    const result = await getMrrSummary();
    expect(result.mrrCents).toBe(3000);
  });
});

describe("getOrgStatusCounts", () => {
  it("buckets orgs by status, with comped taking priority over subscriptionStatus", async () => {
    queueResult([
      { subscriptionStatus: "ACTIVE", billingCompedByAdmin: true }, // comped, not counted as active
      { subscriptionStatus: "TRIALING", billingCompedByAdmin: false },
      { subscriptionStatus: "ACTIVE", billingCompedByAdmin: false },
      { subscriptionStatus: "PAST_DUE", billingCompedByAdmin: false },
      { subscriptionStatus: "CANCELED", billingCompedByAdmin: false },
    ]);
    const result = await getOrgStatusCounts();
    expect(result).toEqual({ trialing: 1, active: 1, pastDue: 1, canceled: 1, comped: 1, total: 5 });
  });
});
