import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";
import { getPortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioOnePager } from "@/lib/portfolioReportData";
import { generatePortfolioNarrativeReportPptx } from "@/lib/portfolioReportExport";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const summary = await getPortfolioSummary();
  const snapshot = buildPortfolioOnePager(summary);
  const generatedAt = new Date();
  const buffer = await generatePortfolioNarrativeReportPptx(report.title, snapshot, report.content, generatedAt);

  const slug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${slug}.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
