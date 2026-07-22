import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scAgreements, scAgreementParties, scAgreementChangeRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScAgreement, getScMemberships, hasPlatformRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

const CONTENT_FIELDS = ["governingLaw", "governingLanguage", "signedDocumentUrl"] as const;

async function loadWithParties(agreementId: string) {
  const [agreement] = await db.select().from(scAgreements).where(eq(scAgreements.id, agreementId));
  if (!agreement) return null;
  const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, agreementId));
  return { ...agreement, parties };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScAgreement(user, agreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await loadWithParties(agreementId);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT"],
  SENT: ["SIGNED", "DRAFT"],
  SIGNED: ["ACTIVE"],
  ACTIVE: ["COMPLETED"],
};

// Editable by any org that's a party to the agreement (via that org's ORG_ADMIN) or
// Platform Admin. Status is an immutable-log-worthy field per the spec ("audit every...
// Agreement... change"), so every PATCH here writes a before/after snapshot regardless of
// which field changed.
//
// Once an agreement is ACTIVE it's a live, mutually-attested contract, so a content edit
// (governingLaw/governingLanguage/signedDocumentUrl) at that point is no longer applied
// directly here -- it's recorded as a PENDING Change Request instead (see the
// change-requests sub-route), and only takes effect once a DIFFERENT party's Org Admin (or
// Platform Admin) accepts it. Status transitions themselves (Send/Attest/Activate/Complete)
// are unaffected -- those are each party's own attestation action, not a shared term being
// rewritten, so they still apply immediately below.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const before = await loadWithParties(agreementId);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const partyOrgIds = before.parties.map((p) => p.scOrganizationId).filter(Boolean) as string[];
  const myPartyOrgId = partyOrgIds.find((id) => memberships.some((m) => m.scOrganizationId === id)) ?? null;
  const isPartyAdmin = memberships.some(
    (m) => m.scOrganizationId && partyOrgIds.includes(m.scOrganizationId) && (m.role === "CLIENT_ORG_ADMIN" || m.role === "VENDOR_ORG_ADMIN")
  );
  if (!isPlatform && !isPartyAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const contentChanges: Record<string, unknown> = {};
  for (const key of CONTENT_FIELDS) {
    if (key in body) contentChanges[key] = body[key];
  }

  if (Object.keys(contentChanges).length && body.status) {
    return NextResponse.json({ error: "Submit content changes and status transitions as separate requests." }, { status: 400 });
  }

  if (Object.keys(contentChanges).length && before.status === "ACTIVE" && !isPlatform) {
    const [changeRequest] = await db
      .insert(scAgreementChangeRequests)
      .values({
        scAgreementId: agreementId,
        proposedByUserId: user.id,
        proposedByOrgId: myPartyOrgId,
        changes: JSON.stringify(contentChanges),
        note: typeof body.note === "string" ? body.note : null,
      })
      .returning();

    await logAudit({
      actor: user,
      action: "keelconnect.agreement.change_requested",
      entityType: "sc_agreement",
      entityId: agreementId,
      scOrganizationId: myPartyOrgId,
      afterValue: JSON.stringify(changeRequest),
    });

    return NextResponse.json(
      {
        pending: true,
        changeRequest,
        message: "This agreement is ACTIVE, so the change was submitted as a Change Request awaiting the other party's approval rather than applied directly.",
      },
      { status: 202 }
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date(), ...contentChanges };
  if (body.status) {
    if (!VALID_TRANSITIONS[before.status]?.includes(body.status) && !isPlatform) {
      return NextResponse.json({ error: `Cannot move agreement from ${before.status} to ${body.status}` }, { status: 400 });
    }
    patch.status = body.status;
  }

  const [updated] = await db.update(scAgreements).set(patch).where(eq(scAgreements.id, agreementId)).returning();

  await logAudit({
    actor: user,
    action: "keelconnect.agreement.updated",
    entityType: "sc_agreement",
    entityId: agreementId,
    scOrganizationId: partyOrgIds[0] ?? null,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json({ ...updated, parties: before.parties });
}
