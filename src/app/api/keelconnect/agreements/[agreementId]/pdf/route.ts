import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scAgreements, scAgreementParties, scOrganizations, scProjects, scBids, scMilestones } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, isDownloadBlocked } from "@/lib/auth";
import { canAccessScAgreement } from "@/lib/keelconnect/access";
import { BRAND, createKeelPdf, finalizeKeelPdf, coverMasthead, sectionTitle } from "@/lib/brand";

// A downloadable record of a KeelConnect engagement, styled like a formal Statement of
// Work/Master Agreement rather than a bare data dump -- this IS the contract document the
// Client and Vendor (and, in Mediator mode, Keel) are attesting to, not just a summary of one.
// There's deliberately no signature-image/upload step anywhere in KeelConnect (see the
// SIGNED-status comment on the agreement PATCH route): "signing" is each party's Org Admin
// electronically attesting on behalf of their organization, and this document is regenerated
// on demand from current data so it always reflects the live status/milestones rather than a
// frozen snapshot from whenever it was first drafted.
async function generateAgreementPdf(agreementId: string): Promise<{ buffer: Buffer; title: string } | null> {
  const [agreement] = await db.select().from(scAgreements).where(eq(scAgreements.id, agreementId));
  if (!agreement) return null;

  const [project] = await db.select().from(scProjects).where(eq(scProjects.id, agreement.scProjectId));
  const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, agreementId));
  const partyOrgIds = [...new Set(parties.map((p) => p.scOrganizationId).filter(Boolean) as string[])];
  // At most two org rows (Client + Vendor) per agreement -- simpler to fetch each individually
  // than to pull in an inArray import for such a small, bounded set.
  const orgById = new Map<string, typeof scOrganizations.$inferSelect>();
  for (const orgId of partyOrgIds) {
    const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
    if (org) orgById.set(orgId, org);
  }

  const [bid] = agreement.scBidId ? await db.select().from(scBids).where(eq(scBids.id, agreement.scBidId)) : [];
  const milestones = await db.select().from(scMilestones).where(eq(scMilestones.scAgreementId, agreementId));

  const generatedAt = new Date();
  const projectTitle = project?.title ?? "Untitled Engagement";
  const docTitle =
    agreement.type === "CLIENT_VENDOR"
      ? "Client-Vendor Engagement Agreement"
      : agreement.type === "CLIENT_PLATFORM"
      ? "Client-Platform Agreement"
      : "Platform-Vendor Agreement";

  const partyLine = (role: "CLIENT" | "VENDOR" | "PLATFORM") => {
    if (role === "PLATFORM") return `Keel (Platform), acting as ${project?.engagementModel === "MEDIATOR" ? "contracting intermediary" : "marketplace facilitator"}`;
    const party = parties.find((p) => p.partyRole === role);
    const org = party?.scOrganizationId ? orgById.get(party.scOrganizationId) : null;
    if (!org) return null;
    return `${org.name}${org.primaryCountry ? ` (${org.primaryCountry})` : ""}${org.taxId ? ` — Tax ID: ${org.taxId}` : ""}`;
  };

  const buffer: Buffer = await new Promise((resolve, reject) => {
    const doc = createKeelPdf({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const body = (text: string) =>
      doc.font("Helvetica").fontSize(10.5).fillColor(BRAND.slate).text(text, { align: "left" }).moveDown(0.8);
    const section = (label: string, lines: (string | null)[]) => {
      sectionTitle(doc, label);
      const text = lines.filter(Boolean).join("\n");
      body(text || "—");
    };

    coverMasthead(doc, docTitle, projectTitle);

    body(
      `This Agreement is entered into by and among the Parties identified below (each a "Party," collectively the ` +
        `"Parties"), in connection with the engagement described herein, facilitated through the KeelConnect ` +
        `marketplace operated by Keel. By attesting agreement to these terms within the KeelConnect platform, each ` +
        `Party's authorized representative confirms that representative's authority to bind that Party.`
    );

    section("1. Parties", [
      `Client: ${partyLine("CLIENT") ?? "N/A for this Agreement"}`,
      `Vendor: ${partyLine("VENDOR") ?? "N/A for this Agreement"}`,
      `Platform: ${partyLine("PLATFORM") ?? "N/A for this Agreement"}`,
    ]);

    section("2. Engagement Description", [
      project?.description || "No description on file.",
      project?.category ? `Category: ${project.category}` : null,
      project?.deadline ? `Target completion: ${new Date(project.deadline).toLocaleDateString()}` : null,
    ]);

    section("3. Commercial Terms", [
      bid ? `Agreed price: ${bid.currency} ${bid.proposedPrice.toLocaleString()}` : "Price to be finalized per accepted bid.",
      bid?.timeline ? `Timeline: ${bid.timeline}` : null,
      project?.engagementModel === "MEDIATOR"
        ? "Engagement model: Mediator — Keel is a contracting party on both sides."
        : "Engagement model: Marketplace — Keel matched the Parties but is not a contracting party.",
    ]);

    section(
      "4. Payment Milestones",
      milestones.length
        ? milestones.map(
            (m) =>
              `- ${m.description}: ${m.currency} ${m.amount.toLocaleString()}${m.dueDate ? ` (due ${new Date(m.dueDate).toLocaleDateString()})` : ""} — ${m.status}`
          )
        : ["No milestones have been defined yet. This Agreement remains binding on the commercial terms above regardless."]
    );

    section("5. Governing Law & Language", [
      `Governing law: ${agreement.governingLaw || "Not specified — to be agreed by the Parties."}`,
      `Governing language: ${agreement.governingLanguage || "en"}`,
    ]);

    section("6. Term & Termination", [
      "This Agreement is effective upon attestation by all Parties and remains in force until the engagement is " +
        "marked Completed, or is earlier terminated by mutual written consent or as otherwise permitted under " +
        "KeelConnect's Terms of Service.",
    ]);

    section(
      "7. Attestation",
      agreement.status === "DRAFT"
        ? ["This Agreement has not yet been sent for attestation."]
        : agreement.status === "SENT"
        ? ["This Agreement has been sent and is awaiting attestation from one or more Parties."]
        : [
            `Status: ${agreement.status}.`,
            `Each Party's Org Admin has electronically attested agreement to these terms on behalf of their ` +
              `organization within the KeelConnect platform (last updated ${agreement.updatedAt.toLocaleDateString()}). ` +
              `No handwritten or uploaded signature is required or used.`,
          ]
    );

    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(BRAND.muted)
      .text(
        "This document was generated automatically from live KeelConnect data and is provided as a record of the " +
          "engagement's terms. It does not constitute legal advice; Parties should have it reviewed by their own " +
          "counsel where appropriate."
      );

    finalizeKeelPdf(doc, generatedAt);
    doc.end();
  });

  return { buffer, title: `${projectTitle} — ${docTitle}` };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScAgreement(user, agreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const result = await generateAgreementPdf(agreementId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slug = result.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "agreement";
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
      "Content-Length": String(result.buffer.length),
    },
  });
}
