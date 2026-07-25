import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prAgreementChangeRequests, prAgreements, prAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getPrMemberships, hasPlatformRole } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";

// Deciding a Change Request: the whole point is that the party who PROPOSED a change can't
// also be the one who accepts it -- otherwise "mutual approval" would just be the original
// unilateral edit with extra steps. So acceptance/rejection is restricted to a party admin
// from a DIFFERENT org than proposedByOrgId, or Platform Admin (who can decide on behalf of
// either side for support/override purposes, same as elsewhere in ProjectRequesta).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ changeRequestId: string }> }) {
  const { changeRequestId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [changeRequest] = await db.select().from(prAgreementChangeRequests).where(eq(prAgreementChangeRequests.id, changeRequestId));
  if (!changeRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (changeRequest.status !== "PENDING") {
    return NextResponse.json({ error: `This change request is already ${changeRequest.status}` }, { status: 400 });
  }

  const [agreement] = await db.select().from(prAgreements).where(eq(prAgreements.id, changeRequest.prAgreementId));
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  const parties = await db.select().from(prAgreementParties).where(eq(prAgreementParties.prAgreementId, agreement.id));
  const partyOrgIds = parties.map((p) => p.prOrganizationId).filter(Boolean) as string[];

  const memberships = await getPrMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const myOrgAdminOrgIds = memberships
    .filter((m) => m.prOrganizationId && partyOrgIds.includes(m.prOrganizationId) && (m.role === "CLIENT_ORG_ADMIN" || m.role === "VENDOR_ORG_ADMIN"))
    .map((m) => m.prOrganizationId as string);

  if (!isPlatform) {
    if (!myOrgAdminOrgIds.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (changeRequest.proposedByOrgId && myOrgAdminOrgIds.includes(changeRequest.proposedByOrgId)) {
      return NextResponse.json({ error: "The party that proposed this change cannot also accept it — it needs the other party's approval." }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  if (body.status !== "ACCEPTED" && body.status !== "REJECTED") {
    return NextResponse.json({ error: "status must be ACCEPTED or REJECTED" }, { status: 400 });
  }

  if (body.status === "ACCEPTED") {
    let changes: Record<string, unknown> = {};
    try {
      changes = JSON.parse(changeRequest.changes);
    } catch {
      // Malformed stored JSON shouldn't be possible (we control the writer), but don't let a
      // parse failure silently apply nothing without at least surfacing it.
      return NextResponse.json({ error: "Could not read the proposed changes for this request." }, { status: 500 });
    }
    await db.update(prAgreements).set({ ...changes, updatedAt: new Date() }).where(eq(prAgreements.id, agreement.id));
  }

  const [updated] = await db
    .update(prAgreementChangeRequests)
    .set({ status: body.status, decidedByUserId: user.id, decidedAt: new Date() })
    .where(eq(prAgreementChangeRequests.id, changeRequestId))
    .returning();

  await logAudit({
    actor: user,
    action: body.status === "ACCEPTED" ? "projectrequesta.agreement.change_accepted" : "projectrequesta.agreement.change_rejected",
    entityType: "pr_agreement_change_request",
    entityId: changeRequestId,
    prOrganizationId: changeRequest.proposedByOrgId,
    beforeValue: JSON.stringify(changeRequest),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}
