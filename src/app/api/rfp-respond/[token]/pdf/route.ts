import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpVendors, rfps, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateRfpPdf } from "@/lib/rfpExport";

// No-login vendor download — same token-is-the-only-credential boundary as
// /api/rfp-respond/[token] (POST). Only ever resolves the ONE vendor's own RFP, and the
// generated PDF never includes the scoring rubric or any other vendor's data (generateRfpPdf
// only ever renders rfp.content).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [vendor] = await db.select({ rfpId: rfpVendors.rfpId }).from(rfpVendors).where(eq(rfpVendors.token, token));
  if (!vendor) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });

  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, vendor.rfpId));
  if (!rfp) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
