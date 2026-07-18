import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnedRfp } from "@/lib/rfp";
import { generateRfpPdf } from "@/lib/rfpExport";
import { isDownloadBlocked } from "@/lib/auth";

// Same "download as a formatted document" treatment as the project charter export — a
// branded PDF with real section headings instead of the raw text blob shown on screen.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { rfp, user } = guard;
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const project = rfp.projectId
    ? (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, rfp.projectId)))[0] ?? null
    : null;

  const buffer = await generateRfpPdf(rfp, project?.name ?? null);
  const slug = rfp.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "rfp";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
