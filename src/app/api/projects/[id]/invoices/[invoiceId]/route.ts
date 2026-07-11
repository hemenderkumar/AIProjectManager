import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const dateFields = ["invoiceDate", "dueDate"] as const;
const numericFields = ["amount"] as const;
const allowed = ["vendor", "invoiceNumber", "amount", "invoiceDate", "dueDate", "status", "notes"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const { id, invoiceId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const v = body[key];
    if ((dateFields as readonly string[]).includes(key)) {
      update[key] = v ? new Date(v) : null;
    } else if ((numericFields as readonly string[]).includes(key)) {
      update[key] = v === "" || v === null || Number.isNaN(Number(v)) ? null : Number(v);
    } else {
      update[key] = v === "" ? null : v;
    }
  }

  const [updated] = await db.update(invoices).set(update).where(eq(invoices.id, invoiceId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const { id, invoiceId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  return NextResponse.json({ ok: true });
}
