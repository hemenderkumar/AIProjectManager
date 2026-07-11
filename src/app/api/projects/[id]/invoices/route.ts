import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.vendor || !String(body.vendor).trim()) {
    return NextResponse.json({ error: "vendor is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(invoices)
    .values({
      projectId: id,
      vendor: body.vendor,
      invoiceNumber: body.invoiceNumber || null,
      amount: body.amount === "" || body.amount == null || Number.isNaN(Number(body.amount)) ? 0 : Number(body.amount),
      invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: body.status || "PENDING",
      notes: body.notes || null,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(invoices).where(eq(invoices.projectId, id));
  return NextResponse.json(rows);
}
