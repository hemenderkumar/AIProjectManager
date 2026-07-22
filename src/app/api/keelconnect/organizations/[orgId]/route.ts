import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, hasPlatformRole, rolesInOrg, requireScOrgRole, requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;

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

// Org profile fields (name/profile/tax id/country/SAML config) are editable by that org's
// own ORG_ADMIN or Platform Admin. verificationStatus is a separate, more sensitive field --
// only a Platform Admin/Compliance Officer can set it (a vendor can't self-declare
// "VERIFIED"), so a request touching it is gated by requireScPlatform instead of the looser
// org-role check, regardless of which other fields are also present in the same body.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const body = await req.json().catch(() => ({}));
  const wantsVerificationChange = "verificationStatus" in body;

  const ctx = wantsVerificationChange
    ? await requireScPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER"])
    : await requireScOrgRole(orgId, ["CLIENT_ORG_ADMIN", "VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(scOrganizations).where(eq(scOrganizations.id, orgId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const key of [
    "name",
    "companyProfile",
    "taxId",
    "primaryCountry",
    "ssoEnabled",
    "samlEntityId",
    "samlIdpMetadataUrl",
    "samlIdpCert",
    "headline",
    "categories",
    "skills",
    "priceBandMin",
    "priceBandMax",
    "portfolioUrl",
    "logoUrl",
  ]) {
    if (key in body) patch[key] = body[key];
  }

  // publicSlug backs the logged-out public vendor profile URL (#256) -- once set it's
  // immutable (never overwritten by a later PATCH) so an existing public link never breaks.
  // Vendor orgs only; a Client org has no public profile to slug.
  if (before.orgType === "VENDOR" && !before.publicSlug && typeof body.publicSlug === "string" && body.publicSlug.trim()) {
    const slug = body.publicSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (slug) {
      const [clash] = await db.select({ id: scOrganizations.id }).from(scOrganizations).where(eq(scOrganizations.publicSlug, slug));
      patch.publicSlug = clash && clash.id !== orgId ? `${slug}-${orgId.slice(-5)}` : slug;
    }
  }

  if (wantsVerificationChange) {
    if (!VERIFICATION_STATUSES.includes(body.verificationStatus)) {
      return NextResponse.json({ error: `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}` }, { status: 400 });
    }
    patch.verificationStatus = body.verificationStatus;
    patch.verifiedAt = body.verificationStatus === "VERIFIED" ? new Date() : before.verifiedAt;
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
