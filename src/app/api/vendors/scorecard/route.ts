import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getVendorScorecards } from "@/lib/vendorScorecard";

// Same access convention as /api/rfps: a SUPER_USER is always scoped to their own company; an
// ADMIN has no company of their own, so they must say which one they're looking at via
// ?organizationId=, same as the Vendor Evaluation (RFP) screen.
export async function GET(req: NextRequest) {
  const user = await requireRole("SUPER_USER"); // roleAtLeast also passes ADMIN through
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let organizationId: string;
  if (user.role === "ADMIN") {
    const requested = req.nextUrl.searchParams.get("organizationId");
    if (!requested) return NextResponse.json([]); // no company selected yet
    organizationId = requested;
  } else {
    if (!user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    organizationId = user.organizationId;
  }

  const scorecards = await getVendorScorecards(organizationId);
  return NextResponse.json(scorecards);
}
