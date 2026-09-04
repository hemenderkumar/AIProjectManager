import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/tenancy";
import { generateWeeklyStatusReport, generateSteeringCommitteeReport } from "@/lib/reportGenerator";
import { getStylePresetAddendum } from "@/lib/contentTemplates";

export async function POST(req: NextRequest) {
  // These reports aggregate the whole portfolio unscoped (by design, see reportGenerator.ts) —
  // internal staff only.
  const user = await requireInternal("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, templateId } = await req.json();
  // Optional saved STYLE_PRESET (entityType STATUS_REPORT, see lib/contentTemplates.ts) —
  // only available on this manual "generate now" path, never on the scheduled cron.
  const styleAddendum = await getStylePresetAddendum(user, templateId);
  const report =
    type === "STEERING_COMMITTEE"
      ? await generateSteeringCommitteeReport(styleAddendum)
      : await generateWeeklyStatusReport(styleAddendum);

  return NextResponse.json(report);
}
