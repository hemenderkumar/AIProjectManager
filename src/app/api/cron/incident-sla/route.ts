import { NextRequest, NextResponse } from "next/server";
import { runIncidentSweep } from "@/lib/incidentSweep";

// Daily proactive sweep: SLA early warning (75%), breach auto-escalation, reporter notices and
// "reporter needs an update" nudges. Vercel Hobby only allows daily crons; on Pro, change the
// schedule in vercel.json (e.g. "*/15 * * * *") for finer-grained early warning.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runIncidentSweep();
  return NextResponse.json({ ok: true, ...summary });
}
