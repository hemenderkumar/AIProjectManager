import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getMrrSummary, getOrgStatusCounts } from "@/lib/finance";

// Internal ADMIN only -- Executa's own revenue figures, not something any client org should see.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [mrr, orgCounts] = await Promise.all([getMrrSummary(), getOrgStatusCounts()]);
  return NextResponse.json({ mrr, orgCounts });
}
