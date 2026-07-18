import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { getPortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioOnePager } from "@/lib/portfolioReportData";
import { generatePortfolioNarrativeReportPdf } from "@/lib/portfolioReportExport";

// Branded PDF export for a stored weekly-status/steering-committee report — pairs the
// report's saved narrative text with a *live* portfolio snapshot (the same numbers the
// Dashboard one-pager shows right now), the same way the per-project status report export
// re-fetches its chart data at export time rather than relying on a stored snapshot.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const summary = await getPortfolioSummary();
  const snapshot = buildPortfolioOnePager(summary);
  const generatedAt = new Date();
  const buffer = await generatePortfolioNarrativeReportPdf(report.title, snapshot, report.content, generatedAt);

  const slug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
