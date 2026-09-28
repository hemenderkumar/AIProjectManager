import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/tenancy";
import {
  generateWeeklyStatusReport,
  generateSteeringCommitteeReport,
  generatePrince2HighlightReport,
  generatePrince2EndStageReport,
} from "@/lib/reportGenerator";
import { getStylePresetAddendum } from "@/lib/contentTemplates";
import { getTerminologyMode } from "@/lib/prince2";

export async function POST(req: NextRequest) {
  // These reports aggregate the whole portfolio unscoped (by design, see reportGenerator.ts) —
  // internal staff only.
  const user = await requireInternal("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, templateId } = await req.json();

  if (type === "PRINCE2_HIGHLIGHT" || type === "PRINCE2_END_STAGE") {
    const mode = await getTerminologyMode();
    if (mode !== "PRINCE2") {
      return NextResponse.json(
        { error: "PRINCE2 reports are only available when Admin > Settings has Terminology mode set to PRINCE2." },
        { status: 403 }
      );
    }
  }

  // Optional saved STYLE_PRESET (entityType STATUS_REPORT, see lib/contentTemplates.ts) —
  // only available on this manual "generate now" path, never on the scheduled cron.
  const styleAddendum = await getStylePresetAddendum(user, templateId);
  const report =
    type === "STEERING_COMMITTEE"
      ? await generateSteeringCommitteeReport(styleAddendum)
      : type === "PRINCE2_HIGHLIGHT"
      ? await generatePrince2HighlightReport(styleAddendum)
      : type === "PRINCE2_END_STAGE"
      ? await generatePrince2EndStageReport(styleAddendum)
      : await generateWeeklyStatusReport(styleAddendum);

  return NextResponse.json(report);
}
