import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scMilestones, scAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScAgreement, getScMemberships, hasPlatformRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScAgreement(user, agreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await db.select().from(scMilestones).where(eq(scMilestones.scAgreementId, agreementId)));
}

// Milestones are defined by either party's Org Admin (whoever is billing against them) or
// Platform Admin -- typically the Vendor side setting up what it'll invoice for, but a
// Client Org Admin may also define milestones in a MEDIATOR engagement.
export async function POST(req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  if (!isPlatform) {
    const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, agreementId));
    const partyOrgIds = parties.map((p) => p.scOrganizationId).filter(Boolean) as string[];
    const isPartyAdmin = memberships.some(
      (m) => m.scOrganizationId && partyOrgIds.includes(m.scOrganizationId) && (m.role === "CLIENT_ORG_ADMIN" || m.role === "VENDOR_ORG_ADMIN")
    );
    if (!isPartyAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.description || !String(body.description).trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!amount || Number.isNaN(amount)) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const [milestone] = await db
    .insert(scMilestones)
    .values({
      scAgreementId: agreementId,
      description: String(body.description).trim(),
      amount,
      currency: body.currency || "USD",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.milestone.created",
    entityType: "sc_milestone",
    entityId: milestone.id,
    afterValue: JSON.stringify(milestone),
  });

  return NextResponse.json(milestone, { status: 201 });
}
