import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateExpense, deleteExpense, type BusinessExpenseCategory } from "@/lib/finance";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  try {
    const updated = await updateExpense(id, {
      category: body.category as BusinessExpenseCategory | undefined,
      payeeName: body.payeeName,
      amountCents: typeof body.amountCents === "number" ? body.amountCents : undefined,
      currency: body.currency,
      expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
      isRecurring: typeof body.isRecurring === "boolean" ? body.isRecurring : undefined,
      notes: body.notes,
    });
    await logAudit({
      actor: admin,
      action: "business_expense.updated",
      entityType: "business_expense",
      entityId: id,
      organizationId: null,
      detail: `${admin.name} updated an expense entry.`,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update expense" }, { status: 400 });
  }
}

// Hard delete, unlike promo codes -- an expense entry has no external Stripe object backing
// it, it's purely a manually-entered ledger row, so correcting a mistake by removing it
// outright is fine (contrast with promo codes, where the underlying Stripe objects can't be
// deleted and might already be referenced by real invoices).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await deleteExpense(id);
  await logAudit({
    actor: admin,
    action: "business_expense.deleted",
    entityType: "business_expense",
    entityId: id,
    organizationId: null,
    detail: `${admin.name} deleted an expense entry.`,
  });
  return NextResponse.json({ ok: true });
}
