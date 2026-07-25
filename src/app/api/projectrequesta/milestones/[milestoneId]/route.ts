import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prMilestones, prAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrAgreement, getPrMemberships, hasPlatformRole, isMfaSatisfied } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";
import { notifyPrOrg } from "@/lib/projectrequesta/notify";

async function requireMilestoneAccess(milestoneId: string) {
  const user = await getCurrentUser();
  if (!user) return { user: null, milestone: null };
  const [milestone] = await db.select().from(prMilestones).where(eq(prMilestones.id, milestoneId));
  if (!milestone) return { user, milestone: null };
  const ok = await canAccessPrAgreement(user, milestone.prAgreementId);
  return { user: ok ? user : null, milestone };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { milestoneId } = await params;
  const { user, milestone } = await requireMilestoneAccess(milestoneId);
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(milestone);
}

// PENDING -> APPROVED is the Client's sign-off that the deliverable behind this milestone is
// acceptable (Client Finance Approver or Org Admin, or Platform Admin). APPROVED -> PAID is
// set only as a side effect of a released Payment against this milestone (see
// payments/[paymentId] PATCH), not directly editable here, so the money movement and the
// milestone's "paid" label can never drift apart.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { milestoneId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [before] = await db.select().from(prMilestones).where(eq(prMilestones.id, milestoneId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessPrAgreement(user, before.prAgreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const memberships = await getPrMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const parties = await db.select().from(prAgreementParties).where(eq(prAgreementParties.prAgreementId, before.prAgreementId));
  const clientOrgId = parties.find((p) => p.partyRole === "CLIENT")?.prOrganizationId;
  const isClientApprover = memberships.some(
    (m) => m.prOrganizationId === clientOrgId && (m.role === "CLIENT_FINANCE_APPROVER" || m.role === "CLIENT_ORG_ADMIN")
  );

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of ["description", "amount", "currency"]) {
    if (key in body) patch[key] = body[key];
  }
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  if (body.status) {
    if (body.status === "APPROVED") {
      if (!isPlatform && !isClientApprover) {
        return NextResponse.json({ error: "Only the Client's Finance Approver/Org Admin (or Platform Admin) can approve a milestone" }, { status: 403 });
      }
      // Finance Approver requires MFA per spec; Client Org Admin approving in that capacity
      // does too, since this action controls money release the same way either role does it.
      if (!isPlatform && !(await isMfaSatisfied(user.id, ["CLIENT_FINANCE_APPROVER", "CLIENT_ORG_ADMIN"]))) {
        return NextResponse.json({ error: "MFA must be enabled to approve milestones" }, { status: 403 });
      }
      if (before.status !== "PENDING") {
        return NextResponse.json({ error: `Cannot approve a milestone that is ${before.status}` }, { status: 400 });
      }
      patch.status = "APPROVED";
    } else if (body.status === "PAID" && !isPlatform) {
      return NextResponse.json({ error: "Milestone is marked paid automatically when its payment is released" }, { status: 400 });
    } else if (body.status === "PAID") {
      patch.status = "PAID";
    }
  }

  const [updated] = await db.update(prMilestones).set(patch).where(eq(prMilestones.id, milestoneId)).returning();

  await logAudit({
    actor: user,
    action: "projectrequesta.milestone.updated",
    entityType: "pr_milestone",
    entityId: milestoneId,
    prOrganizationId: clientOrgId ?? null,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  if (patch.status === "APPROVED") {
    const vendorOrgId = parties.find((p) => p.partyRole === "VENDOR")?.prOrganizationId;
    notifyPrOrg(
      vendorOrgId,
      `Milestone approved: ${updated.description ?? "Milestone"}`,
      `The client approved the milestone "${updated.description ?? ""}" (${updated.currency} ${updated.amount?.toLocaleString?.() ?? updated.amount}). Payment can now be raised in ProjectRequesta.`,
      ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"]
    ).catch(() => {});
  }

  return NextResponse.json(updated);
}
