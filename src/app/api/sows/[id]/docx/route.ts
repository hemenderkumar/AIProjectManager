import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { buildSectionedDocx, docxHeaders } from "@/lib/docxExport";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sow] = await db.select().from(sows).where(eq(sows.id, id));
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subtitle = `Statement of Work with ${sow.vendorName} — status: ${sow.status.replace("_", " ")}`;
  const sections = [
    { heading: "Scope", body: sow.scope ?? "" },
    { heading: "Deliverables", body: sow.deliverablesSummary ?? "" },
    { heading: "Timeline", body: sow.timeline ?? "" },
    {
      heading: "Funding",
      body: [
        sow.fundingAmount != null ? `Amount: $${sow.fundingAmount.toLocaleString()}` : null,
        sow.fundingTerms ? `Terms: ${sow.fundingTerms}` : null,
      ].filter(Boolean).join("\n"),
    },
    { heading: "Risks", body: sow.risks ?? "" },
    { heading: "Issues", body: sow.issues ?? "" },
    { heading: "Full Document", body: sow.content ?? "" },
    {
      heading: "Approvals & Signature",
      body: [
        sow.approvedBy ? `Internally approved by ${sow.approvedBy} on ${sow.approvedAt?.toLocaleDateString()}` : null,
        sow.signedBy ? `Signed by ${sow.signedBy} on ${sow.signedAt?.toLocaleDateString()}` : null,
      ].filter(Boolean).join("\n") || "Not yet approved or signed.",
    },
  ];

  const buffer = await buildSectionedDocx(sow.title, subtitle, sections);
  const slug = sow.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sow";
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}.docx`) });
}
