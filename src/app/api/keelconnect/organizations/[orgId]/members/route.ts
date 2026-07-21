import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrgMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireScOrgRole, getScMemberships, hasPlatformRole, rolesInOrg } from "@/lib/keelconnect/access";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ScRole } from "@/lib/keelconnect/access";

const CLIENT_MEMBER_ROLES: ScRole[] = ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER", "CLIENT_FINANCE_APPROVER"];
const VENDOR_MEMBER_ROLES: ScRole[] = ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getScMemberships(user.id);
  if (!hasPlatformRole(memberships) && !rolesInOrg(memberships, orgId).length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: scOrgMembers.id,
      role: scOrgMembers.role,
      createdAt: scOrgMembers.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(scOrgMembers)
    .innerJoin(users, eq(scOrgMembers.userId, users.id))
    .where(eq(scOrgMembers.scOrganizationId, orgId));
  return NextResponse.json(rows);
}

// Grants a KeelConnect role in this org to an existing Keel account (looked up by email --
// login/session is shared across Keel Deliver and KeelConnect, so this never creates a new
// login, only a new sc_org_members grant on top of one). Only that org's own ORG_ADMIN, or
// Platform Admin, can grant membership -- this is exactly the "permission change" the spec
// calls out for audit-log before/after tracking.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScOrgRole(orgId, ["CLIENT_ORG_ADMIN", "VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role as ScRole;
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const allowedRoles = [...CLIENT_MEMBER_ROLES, ...VENDOR_MEMBER_ROLES];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${allowedRoles.join(", ")}` }, { status: 400 });
  }

  const [targetUser] = await db.select().from(users).where(eq(users.email, email));
  if (!targetUser) {
    return NextResponse.json({ error: "No existing Keel account with that email. They must have a Keel login first." }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(scOrgMembers)
    .where(and(eq(scOrgMembers.userId, targetUser.id), eq(scOrgMembers.scOrganizationId, orgId), eq(scOrgMembers.role, role)));
  if (existing) return NextResponse.json({ error: "Already has that role in this organization" }, { status: 409 });

  const [member] = await db
    .insert(scOrgMembers)
    .values({ userId: targetUser.id, scOrganizationId: orgId, role })
    .returning();

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.org_member.granted",
    entityType: "sc_org_member",
    entityId: member.id,
    scOrganizationId: orgId,
    beforeValue: null,
    afterValue: JSON.stringify({ userId: targetUser.id, email: targetUser.email, role }),
  });

  return NextResponse.json({ ...member, email: targetUser.email, name: targetUser.name }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireScOrgRole(orgId, ["CLIENT_ORG_ADMIN", "VENDOR_ORG_ADMIN"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const memberId = String(body.memberId || "");
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  const [before] = await db
    .select()
    .from(scOrgMembers)
    .where(and(eq(scOrgMembers.id, memberId), eq(scOrgMembers.scOrganizationId, orgId)));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(scOrgMembers).where(eq(scOrgMembers.id, memberId));

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.org_member.revoked",
    entityType: "sc_org_member",
    entityId: memberId,
    scOrganizationId: orgId,
    beforeValue: JSON.stringify(before),
    afterValue: null,
  });

  return NextResponse.json({ ok: true });
}
