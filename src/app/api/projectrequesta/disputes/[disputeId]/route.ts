import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prDisputes, prAgreementParties, prProjects, prBids } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrDispute, requirePrPlatform } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";
import { notifyPrOrg } from "@/lib/projectrequesta/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [dispute] = await db.select().from(prDisputes).where(eq(prDisputes.id, disputeId));
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessPrDispute(user, { prProjectId: dispute.prProjectId, prAgreementId: dispute.prAgreementId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(dispute);
}

// Only Platform Compliance Officer/Admin can move a dispute to UNDER_REVIEW/RESOLVED --
// mediation is a platform function, not something either party can self-serve, which is why
// this doesn't reuse the party-based access check the GET above uses.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const ctx = await requirePrPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(prDisputes).where(eq(prDisputes.id, disputeId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) {
    if (!["OPEN", "UNDER_REVIEW", "RESOLVED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "RESOLVED") patch.resolvedAt = new Date();
  }
  if ("resolutionNotes" in body) patch.resolutionNotes = body.resolutionNotes;

  const [updated] = await db.update(prDisputes).set(patch).where(eq(prDisputes.id, disputeId)).returning();

  await logAudit({
    actor: ctx.user,
    action: "projectrequesta.dispute.updated",
    entityType: "pr_dispute",
    entityId: disputeId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  if (body.status === "RESOLVED" || body.status === "UNDER_REVIEW") {
    // Notify every org actually party to the underlying agreement or project -- whichever
    // this dispute is attached to (a pre-award dispute has an agreement of null).
    const orgIds = new Set<string>();
    if (updated.prAgreementId) {
      const parties = await db.select().from(prAgreementParties).where(eq(prAgreementParties.prAgreementId, updated.prAgreementId));
      parties.forEach((p) => p.prOrganizationId && orgIds.add(p.prOrganizationId));
    } else if (updated.prProjectId) {
      const [project] = await db.select().from(prProjects).where(eq(prProjects.id, updated.prProjectId));
      if (project) {
        orgIds.add(project.clientOrgId);
        const [awardedBid] = await db
          .select()
          .from(prBids)
          .where(and(eq(prBids.prProjectId, project.id), eq(prBids.status, "ACCEPTED")));
        if (awardedBid) orgIds.add(awardedBid.vendorOrgId);
      }
    }
    const subject = body.status === "RESOLVED" ? "Dispute resolved" : "Dispute under review";
    const text =
      body.status === "RESOLVED"
        ? `The dispute has been resolved.${updated.resolutionNotes ? ` Notes: ${updated.resolutionNotes}` : ""}`
        : "Executa's compliance team has picked up the dispute and is reviewing it.";
    for (const orgId of orgIds) {
      notifyPrOrg(orgId, subject, text).catch(() => {});
    }
  }

  return NextResponse.json(updated);
}
