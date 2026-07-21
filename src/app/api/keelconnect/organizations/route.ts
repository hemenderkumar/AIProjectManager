import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations, scOrgMembers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, hasPlatformRole, clientOrgIds, vendorOrgIds } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";
import { inArray } from "drizzle-orm";

const ORG_TYPES = ["CLIENT", "VENDOR"] as const;

// Any logged-in Keel account can create a KeelConnect organization -- this is the
// self-serve "register my company as a Client/Vendor" entry point, mirroring how Keel
// Deliver organizations are created via admin/self-registration. Platform staff never need
// to be a member of a Client/Vendor org, so no platform-role gate here.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) {
    return NextResponse.json(await db.select().from(scOrganizations));
  }

  const myOrgIds = [...clientOrgIds(memberships), ...vendorOrgIds(memberships)];
  if (!myOrgIds.length) return NextResponse.json([]);
  return NextResponse.json(await db.select().from(scOrganizations).where(inArray(scOrganizations.id, myOrgIds)));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!ORG_TYPES.includes(body.orgType)) {
    return NextResponse.json({ error: `orgType must be one of: ${ORG_TYPES.join(", ")}` }, { status: 400 });
  }

  const [org] = await db
    .insert(scOrganizations)
    .values({
      name: String(body.name).trim(),
      orgType: body.orgType,
      companyProfile: body.companyProfile || null,
      taxId: body.taxId || null,
      primaryCountry: body.primaryCountry || null,
    })
    .returning();

  // Whoever creates the org becomes its first admin -- CLIENT_ORG_ADMIN or
  // VENDOR_ORG_ADMIN depending on which side they registered as.
  const adminRole = body.orgType === "CLIENT" ? "CLIENT_ORG_ADMIN" : "VENDOR_ORG_ADMIN";
  await db.insert(scOrgMembers).values({ userId: user.id, scOrganizationId: org.id, role: adminRole });

  await logAudit({
    actor: user,
    action: "keelconnect.organization.created",
    entityType: "sc_organization",
    entityId: org.id,
    scOrganizationId: org.id,
    afterValue: JSON.stringify({ name: org.name, orgType: org.orgType }),
  });

  return NextResponse.json(org, { status: 201 });
}
