import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { buildPlannedVsActual } from "@/lib/reportData";
import { generateReportPdf } from "@/lib/reportExport";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId, report } = await req.json().catch(() => ({}));
  if (!projectId || !report) {
    return NextResponse.json({ error: "projectId and report are required" }, { status: 400 });
  }

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const chartData = buildPlannedVsActual(detail);
  const buffer = await generateReportPdf({
    projectName: detail.project.name,
    reportText: report,
    chartData,
    generatedAt: new Date(),
  });

  const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-status-report.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
