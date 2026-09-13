import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createExpense, listExpenses, type BusinessExpenseCategory } from "@/lib/finance";

export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await listExpenses();
  return NextResponse.json(all);
}

// Recording an expense here is a manual ledger entry, not a payment -- see the file-level
// comment in lib/finance.ts. Nothing in this route touches Stripe, a bank, or a payroll
// provider; it only writes a row for reporting.
export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.expenseDate) return NextResponse.json({ error: "expenseDate is required" }, { status: 400 });

  try {
    const created = await createExpense({
      category: body.category as BusinessExpenseCategory,
      payeeName: String(body.payeeName ?? ""),
      amountCents: Number(body.amountCents),
      currency: body.currency || undefined,
      expenseDate: new Date(body.expenseDate),
      isRecurring: Boolean(body.isRecurring),
      notes: body.notes || null,
      createdBy: admin,
    });

    await logAudit({
      actor: admin,
      action: "business_expense.created",
      entityType: "business_expense",
      entityId: created.id,
      organizationId: null,
      detail: `${admin.name} logged a ${created.category} expense of $${(created.amountCents / 100).toFixed(2)} to ${created.payeeName}.`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create expense" }, { status: 400 });
  }
}
