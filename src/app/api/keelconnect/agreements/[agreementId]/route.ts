import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scAgreements, scAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScAgreement, getScMemberships, hasPlatformRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

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
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const before = await loadWithParties(agreementId);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const partyOrgIds = before.parties.map((p) => p.scOrganizationId).filter(Boolean) as string[];
  const isPartyAdmin = memberships.some(
    (m) => m.scOrganizationId && partyOrgIds.includes(m.scOrganizationId) && (m.role === "CLIENT_ORG_ADMIN" || m.role === "VENDOR_ORG_ADMIN")
  );
  if (!isPlatform && !isPartyAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["governingLaw", "governingLanguage", "signedDocumentUrl"]) {
    if (key in body) patch[key] = body[key];
  }
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
