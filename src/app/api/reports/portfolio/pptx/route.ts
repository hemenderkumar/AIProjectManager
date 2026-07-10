import { NextResponse } from "next/server";
import { getPortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioOnePager } from "@/lib/portfolioReportData";
import { generatePortfolioOnePagerPptx } from "@/lib/portfolioExport";
import { requireRole } from "@/lib/auth";

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await getPortfolioSummary();
  const data = buildPortfolioOnePager(summary);
  const generatedAt = new Date();
  const buffer = await generatePortfolioOnePagerPptx(data, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="portfolio-executive-summary.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
