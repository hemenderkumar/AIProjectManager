import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPromoFinancialSummary } from "@/lib/promo";

// Internal ADMIN only, same gate as the rest of the promo-codes surface -- this is Executa's
// own revenue-impact reporting, not something a client org's SUPER_USER has any reason to see.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const summary = await getPromoFinancialSummary();
  return NextResponse.json(summary);
}
