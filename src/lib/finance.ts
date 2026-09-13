import { db } from "./db";
import { organizations, plans, users, businessExpenses } from "./db/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { getStripe } from "./billing";
import type { SessionUser } from "./auth";

// Executa's own business financials -- distinct from both the per-client budget/accounting
// export (lib/orgExport.ts and friends, which price out a *client's* project) and the promo
// financial tracking (lib/promo.ts, which is scoped to promo codes only). This file answers
// "how is Executa doing as a business": current run-rate revenue, operating expenses, and
// profitability. It never moves money -- MRR/ARR are read from subscription state Stripe
// already reports, revenue history is read from Stripe's own paid invoices, and expenses are a
// manual ledger an admin enters after paying someone through a real channel elsewhere.

export type BusinessExpenseCategory = "PAYROLL" | "CONTRACTOR" | "INFRASTRUCTURE" | "TOOLING" | "MARKETING" | "LEGAL_AND_ADMIN" | "OTHER";

export type MrrSummary = {
  mrrCents: number;
  arrCents: number;
  payingOrgCount: number;
  byPlan: Array<{ planId: string; planName: string; orgCount: number; mrrCents: number }>;
};

// A "genuinely paying" org is ACTIVE, not admin-comped (comped orgs pay nothing even though
// isOrgBillingBlocked treats them the same as a real subscriber), and has an actual Stripe
// subscription attached -- excludes the grandfathered pre-billing orgs the original billing
// migration marked ACTIVE with no stripeSubscriptionId, which never paid anything either.
export async function getMrrSummary(): Promise<MrrSummary> {
  // Sequential, not Promise.all -- these are small tables (orgs/plans/users), and keeping the
  // query order strictly linear makes this straightforward to unit-test against the shared
  // mock query chain (see promo.test.ts / billing.test.ts for the same convention).
  const payingOrgs = await db
    .select({ id: organizations.id, planId: organizations.planId })
    .from(organizations)
    .where(and(eq(organizations.subscriptionStatus, "ACTIVE"), eq(organizations.billingCompedByAdmin, false), isNotNull(organizations.stripeSubscriptionId)));
  const allPlans = await db.select().from(plans);

  const planById = new Map(allPlans.map((p) => [p.id, p]));
  const orgIds = payingOrgs.map((o) => o.id);
  const allUsers = orgIds.length ? await db.select({ organizationId: users.organizationId }).from(users) : [];
  const seatCountByOrg = new Map<string, number>();
  for (const u of allUsers) {
    if (!u.organizationId) continue;
    seatCountByOrg.set(u.organizationId, (seatCountByOrg.get(u.organizationId) ?? 0) + 1);
  }

  let mrrCents = 0;
  const byPlanMap = new Map<string, { planName: string; orgCount: number; mrrCents: number }>();

  for (const org of payingOrgs) {
    if (!org.planId) continue;
    const plan = planById.get(org.planId);
    if (!plan || plan.priceCents == null) continue;

    const monthlyCents = plan.billingInterval === "year" ? plan.priceCents / 12 : plan.priceCents;
    const quantity = plan.billingModel === "per_seat" ? Math.max(1, seatCountByOrg.get(org.id) ?? 1) : 1;
    const orgMrrCents = monthlyCents * quantity;
    mrrCents += orgMrrCents;

    const entry = byPlanMap.get(plan.id) ?? { planName: plan.name, orgCount: 0, mrrCents: 0 };
    entry.orgCount += 1;
    entry.mrrCents += orgMrrCents;
    byPlanMap.set(plan.id, entry);
  }

  return {
    mrrCents: Math.round(mrrCents),
    arrCents: Math.round(mrrCents * 12),
    payingOrgCount: payingOrgs.filter((o) => o.planId && planById.get(o.planId)?.priceCents != null).length,
    byPlan: Array.from(byPlanMap.entries())
      .map(([planId, v]) => ({ planId, ...v, mrrCents: Math.round(v.mrrCents) }))
      .sort((a, b) => b.mrrCents - a.mrrCents),
  };
}

export type OrgStatusCounts = { trialing: number; active: number; pastDue: number; canceled: number; comped: number; total: number };

export async function getOrgStatusCounts(): Promise<OrgStatusCounts> {
  const rows = await db.select({ subscriptionStatus: organizations.subscriptionStatus, billingCompedByAdmin: organizations.billingCompedByAdmin }).from(organizations);
  const counts: OrgStatusCounts = { trialing: 0, active: 0, pastDue: 0, canceled: 0, comped: 0, total: rows.length };
  for (const r of rows) {
    if (r.billingCompedByAdmin) counts.comped += 1;
    else if (r.subscriptionStatus === "TRIALING") counts.trialing += 1;
    else if (r.subscriptionStatus === "ACTIVE") counts.active += 1;
    else if (r.subscriptionStatus === "PAST_DUE") counts.pastDue += 1;
    else if (r.subscriptionStatus === "CANCELED") counts.canceled += 1;
  }
  return counts;
}

export type CreateExpenseInput = {
  category: BusinessExpenseCategory;
  payeeName: string;
  amountCents: number;
  currency?: string;
  expenseDate: Date;
  isRecurring?: boolean;
  notes?: string | null;
  createdBy?: SessionUser | null;
};

const VALID_CATEGORIES: BusinessExpenseCategory[] = ["PAYROLL", "CONTRACTOR", "INFRASTRUCTURE", "TOOLING", "MARKETING", "LEGAL_AND_ADMIN", "OTHER"];

export function validateExpenseInput(input: Pick<CreateExpenseInput, "category" | "payeeName" | "amountCents">): string | null {
  if (!VALID_CATEGORIES.includes(input.category)) return "Invalid category.";
  if (!input.payeeName?.trim()) return "Payee name is required.";
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return "Amount must be a positive number.";
  return null;
}

export async function createExpense(input: CreateExpenseInput) {
  const error = validateExpenseInput(input);
  if (error) throw new Error(error);
  const [created] = await db
    .insert(businessExpenses)
    .values({
      category: input.category,
      payeeName: input.payeeName.trim(),
      amountCents: Math.round(input.amountCents),
      currency: input.currency ?? "usd",
      expenseDate: input.expenseDate,
      isRecurring: input.isRecurring ?? false,
      notes: input.notes ?? null,
      createdBy: input.createdBy?.name ?? null,
    })
    .returning();
  return created;
}

export async function listExpenses() {
  return db.select().from(businessExpenses).orderBy(desc(businessExpenses.expenseDate));
}

export async function updateExpense(id: string, patch: Partial<Omit<CreateExpenseInput, "createdBy">>) {
  // Only validate the fields actually present in this patch -- a partial update (e.g. just
  // fixing a typo in notes) shouldn't require re-supplying every field to pass validation.
  if (patch.category != null && !VALID_CATEGORIES.includes(patch.category)) throw new Error("Invalid category.");
  if (patch.payeeName != null && !patch.payeeName.trim()) throw new Error("Payee name is required.");
  if (patch.amountCents != null && (!Number.isFinite(patch.amountCents) || patch.amountCents <= 0)) throw new Error("Amount must be a positive number.");

  const [updated] = await db
    .update(businessExpenses)
    .set({
      ...(patch.category ? { category: patch.category } : {}),
      ...(patch.payeeName != null ? { payeeName: patch.payeeName.trim() } : {}),
      ...(patch.amountCents != null ? { amountCents: Math.round(patch.amountCents) } : {}),
      ...(patch.currency ? { currency: patch.currency } : {}),
      ...(patch.expenseDate ? { expenseDate: patch.expenseDate } : {}),
      ...(patch.isRecurring != null ? { isRecurring: patch.isRecurring } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .where(eq(businessExpenses.id, id))
    .returning();
  if (!updated) throw new Error("Expense not found.");
  return updated;
}

export async function deleteExpense(id: string) {
  await db.delete(businessExpenses).where(eq(businessExpenses.id, id));
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // "2026-09"
}

export async function getMonthlyExpenseTotals(): Promise<Array<{ month: string; totalCents: number }>> {
  const rows = await db.select({ expenseDate: businessExpenses.expenseDate, amountCents: businessExpenses.amountCents }).from(businessExpenses);
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const key = monthKey(r.expenseDate);
    byMonth.set(key, (byMonth.get(key) ?? 0) + r.amountCents);
  }
  return Array.from(byMonth.entries())
    .map(([month, totalCents]) => ({ month, totalCents }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// Real collected revenue, read from Stripe's own paid Invoices rather than derived from list
// price -- catches proration, discounts, and partial-period charges that a plan-price-based
// estimate would miss. Best-effort: returns [] if Stripe isn't configured or the call fails,
// since this is a reporting nicety, not something that should ever break the finance page.
export async function getRevenueHistory(monthsBack = 6): Promise<Array<{ month: string; revenueCents: number }>> {
  try {
    const stripe = getStripe();
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);
    const byMonth = new Map<string, number>();

    let startingAfter: string | undefined;
    // Cap at a handful of pages -- an early-stage product's paid-invoice volume over a
    // 6-12 month window fits comfortably within this; revisit if that stops being true.
    for (let page = 0; page < 10; page++) {
      const result = await stripe.invoices.list({
        status: "paid",
        created: { gte: Math.floor(since.getTime() / 1000) },
        limit: 100,
        starting_after: startingAfter,
      });
      for (const invoice of result.data) {
        if (!invoice.created) continue;
        const key = monthKey(new Date(invoice.created * 1000));
        byMonth.set(key, (byMonth.get(key) ?? 0) + (invoice.amount_paid ?? 0));
      }
      if (!result.has_more || result.data.length === 0) break;
      startingAfter = result.data[result.data.length - 1].id;
    }

    return Array.from(byMonth.entries())
      .map(([month, revenueCents]) => ({ month, revenueCents }))
      .sort((a, b) => a.month.localeCompare(b.month));
  } catch {
    return [];
  }
}

export type ProfitabilityMonth = { month: string; revenueCents: number; expenseCents: number; netCents: number };

export async function getProfitability(monthsBack = 6): Promise<ProfitabilityMonth[]> {
  const [revenue, expenses] = await Promise.all([getRevenueHistory(monthsBack), getMonthlyExpenseTotals()]);
  const months = new Set([...revenue.map((r) => r.month), ...expenses.map((e) => e.month)]);
  const revenueByMonth = new Map(revenue.map((r) => [r.month, r.revenueCents]));
  const expenseByMonth = new Map(expenses.map((e) => [e.month, e.totalCents]));
  return Array.from(months)
    .map((month) => {
      const revenueCents = revenueByMonth.get(month) ?? 0;
      const expenseCents = expenseByMonth.get(month) ?? 0;
      return { month, revenueCents, expenseCents, netCents: revenueCents - expenseCents };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}
