import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sows, projects, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { buildSectionedDocx, docxHeaders, type DocMeta } from "@/lib/docxExport";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sow] = await db.select().from(sows).where(eq(sows.id, id));
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  // Company vs Keel branding: a project's organizationId is the client company it's for (null =
  // internal-only) — see the matching comment in the deliverables docx route.
  const [project] = await db
    .select({ name: projects.name, organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, sow.projectId));
  let companyName: string | null = null;
  if (project?.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, project.organizationId));
    companyName = org?.name ?? null;
  }
  const meta: DocMeta = {
    documentType: "Statement of Work",
    projectName: project?.name ?? "Untitled Project",
    companyName,
    status: sow.status,
    createdAt: sow.createdAt,
    updatedAt: sow.updatedAt,
    approvedBy: sow.approvedBy,
    approvedAt: sow.approvedAt,
  };

  const subtitle = `Statement of Work with ${sow.vendorName}`;
  const sections = [
    { heading: "Executive Summary", body: sow.executiveSummary ?? "" },
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

  const buffer = await buildSectionedDocx(sow.title, subtitle, sections, meta);
  const slug = sow.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sow";
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}.docx`) });
}
