import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPortfolioBoardView } from "@/lib/portfolioBoard";

// View is open to PM+ (same tier that can see the portfolio-wide reports); recording a
// decision (POST /api/portfolio-board/decisions) is restricted to SUPER_USER+.
export async function GET() {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const view = await getPortfolioBoardView(user);
  return NextResponse.json(view);
}
