import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { generateWeeklyStatusReport, generateSteeringCommitteeReport } from "@/lib/reportGenerator";

export async function POST(req: NextRequest) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await req.json();
  const report =
    type === "STEERING_COMMITTEE"
      ? await generateSteeringCommitteeReport()
      : await generateWeeklyStatusReport();

  return NextResponse.json(report);
}
