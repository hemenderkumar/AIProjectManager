import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getProfitability } from "@/lib/finance";

export async function GET(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const monthsParam = req.nextUrl.searchParams.get("months");
  const months = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6)) : 6;
  const data = await getProfitability(months);
  return NextResponse.json(data);
}
