import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyStatusReport } from "@/lib/reportGenerator";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await generateWeeklyStatusReport();
  return NextResponse.json({ ok: true, reportId: report.id });
}
