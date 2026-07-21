import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, hasPlatformRole, rolesInOrg, requireScOrgRole, requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

async function checkReadAccess(orgId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships) || rolesInOrg(memberships, orgId).length > 0) return user;
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await checkReadAccess(orgId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}

// Org profile fields (name/profile/tax id/country/SAML config) editable by that org's own
// ORG_ADMIN or Platform Admin. verificationStatus is deliberately NOT editable here -- that's
// gated to Platform Compliance Officer/Admin via the compliance-records endpoints, so a
// vendor can't just self-declare "VERIFIED".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScOrgRole(orgId, ["CLIENT_ORG_ADMIN", "VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const [before] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "companyProfile", "taxId", "primaryCountry", "ssoEnabled", "samlEntityId", "samlIdpMetadataUrl", "samlIdpCert"]) {
    if (key in body) patch[key] = body[key];
  }

  const [updated] = await db.update(scOrganizations).set(patch).where(eq(scOrganizations.id, orgId)).returning();

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.organization.updated",
    entityType: "sc_organization",
    entityId: orgId,
    scOrganizationId: orgId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}

// Platform-only: hard delete an org (deregistration). Cascades to memberships, compliance
// records, projects, etc. via the FK ON DELETE CASCADE chain set up in the schema.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScPlatform(["PLATFORM_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(scOrganizations).where(eq(scOrganizations.id, orgId));

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.organization.deleted",
    entityType: "sc_organization",
    entityId: orgId,
    scOrganizationId: orgId,
    beforeValue: JSON.stringify(before),
  });

  return NextResponse.json({ ok: true });
}
