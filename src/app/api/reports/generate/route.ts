import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/tenancy";
import { generateWeeklyStatusReport, generateSteeringCommitteeReport } from "@/lib/reportGenerator";

export async function POST(req: NextRequest) {
  // These reports aggregate the whole portfolio unscoped (by design, see reportGenerator.ts) —
  // internal staff only.
  const user = await requireInternal("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await req.json();
  const report =
    type === "STEERING_COMMITTEE"
      ? await generateSteeringCommitteeReport()
      : await generateWeeklyStatusReport();

  return NextResponse.json(report);
}
