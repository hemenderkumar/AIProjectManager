import { NextResponse } from "next/server";
import { getPortfolioSummary } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const summary = await getPortfolioSummary(_authUser);
  return NextResponse.json(summary);
}
