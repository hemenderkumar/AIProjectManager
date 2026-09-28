import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { computePmoScorecard } from "@/lib/pmoScorecard";
import { getPmoGovernanceModel } from "@/lib/pmoGovernance";

// Same visibility floor as the other portfolio-rollup endpoints (/api/forecast/eac,
// /api/forecast/accuracy) -- VIEWER, scoped by listVisibleProjects inside
// computePmoScorecard. Named resources appear here (see resourceUtilization), so this is
// slightly more sensitive than the pure-aggregate forecast endpoints, but no more so than
// the existing Resources page which is already VIEWER-and-up internal-only territory.
export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [scorecard, governanceModel] = await Promise.all([computePmoScorecard(user), getPmoGovernanceModel()]);
  return NextResponse.json({ ...scorecard, governanceModel });
}
