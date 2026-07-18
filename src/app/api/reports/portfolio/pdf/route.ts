import { NextResponse } from "next/server";
import { getPortfolioSummary } from "@/lib/portfolio";
import { buildPortfolioOnePager } from "@/lib/portfolioReportData";
import { generatePortfolioOnePagerPdf } from "@/lib/portfolioExport";
import { requireRole, isDownloadBlocked } from "@/lib/auth";

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const summary = await getPortfolioSummary(user);
  const data = buildPortfolioOnePager(summary);
  const generatedAt = new Date();
  const buffer = await generatePortfolioOnePagerPdf(data, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="portfolio-executive-summary.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
