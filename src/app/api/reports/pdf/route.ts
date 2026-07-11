import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { buildPlannedVsActual } from "@/lib/reportData";
import { generateReportPdf, generateReportOnePagerPdf } from "@/lib/reportExport";
import { requireProjectAccess } from "@/lib/tenancy";

export async function POST(req: NextRequest) {
  const { projectId, report, onePager } = await req.json().catch(() => ({}));
  if (!projectId || !report) {
    return NextResponse.json({ error: "projectId and report are required" }, { status: 400 });
  }

  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const chartData = buildPlannedVsActual(detail);
  const input = {
    projectName: detail.project.name,
    reportText: report,
    chartData,
    generatedAt: new Date(),
  };
  const buffer = onePager ? await generateReportOnePagerPdf(input) : await generateReportPdf(input);

  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
  const suffix = onePager ? "status-report-1pager" : "status-report";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-${suffix}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
